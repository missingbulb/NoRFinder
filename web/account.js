// Signing in with Google (1.50), from the avatar's menu, with no server of the site's own: Google signs the user in
// in its own window and hands this page a token, and the page keeps the user's settings in their own Google Drive,
// in the app's hidden folder, as one file it reads whole and replaces whole: {browser key: the string this device
// keeps under it}, for the keys whose settings follow the user. The services it reaches: Google's sign-in script
// and window, Google's account details (name, email, picture), and the Drive API for that one file.
"use strict";
const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";
const SCOPES = "openid email profile https://www.googleapis.com/auth/drive.appdata";
const USER_INFO = "https://openidconnect.googleapis.com/v1/userinfo";
const FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FILE_NAME = "rauntruth-settings.json";
// a token this close to running out is renewed rather than used
const MARGIN_MS = 60 * 1000;
const SAVE_AFTER_MS = 400;
// who is signed in on this device: {user: {name, email, picture}, token, until (ms), fileId, changed}, changed
// true while this device has a setting that follows the user that Drive does not have yet
export const SIGNED_IN = "nor-google-sign-in";

// keys: the browser keys whose settings follow the user; applied(): runs once Drive's settings have replaced them
export function account({ keys, menu, clientId, applied }) {
  const $ = (s) => menu.querySelector(s);
  let me = read(), client = null, script = null, saving = null;

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
    if (r.status === 401) { me.token = null; keep(); waitForClick(); throw new Error("Google refused the token"); }
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
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify({ name: FILE_NAME, parents: ["appDataFolder"] })], { type: "application/json" }));
      form.append("file", new Blob([body], { type: "application/json" }));
      me.fileId = (await (await google(`${UPLOAD}?uploadType=multipart&fields=id`, { method: "POST", body: form })).json()).id;
    }
    me.changed = false; keep();
  }
  // Drive's file wins, unless this device changed a setting since it last synced; with no file, this device's start it
  async function sync() {
    const id = await fileId();
    if (!id || me.changed) return save();
    apply(await (await google(`${FILES}/${id}?alt=media`)).json());
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
  };

  // Google's script, loaded only for someone signing in or signed in; its token client asks for the token
  const ready = () => (script ||= new Promise((ok, fail) => document.head.append(Object.assign(document.createElement("script"), { src: GOOGLE_SCRIPT, async: true, onload: ok, onerror: fail })))
    .then(() => {
      client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: SCOPES,
        callback: async (t) => {
          if (t.error) return console.warn("Google gave no token:", t.error);
          const first = !me || !me.user;
          me = { ...(me || {}), token: t.access_token, until: Date.now() + t.expires_in * 1000 };
          if (first) {
            const u = await (await google(USER_INFO)).json();
            me.user = { name: u.name || u.email, email: u.email, picture: u.picture || null };
          }
          keep(); show(); syncing();
        },
      });
    })
    .catch((e) => { script = null; console.warn("Google sign-in did not load:", e); }));
  // a token must be asked for in a click: once it has run out, the user's next click anywhere asks, silently
  // while Google still remembers their consent
  function waitForClick() {
    ready();
    document.addEventListener("pointerdown", function renew() {
      if (!me || live()) return;
      if (client) client.requestAccessToken({ prompt: "", login_hint: me.user.email });
      else document.addEventListener("pointerdown", renew, { once: true, capture: true });
    }, { once: true, capture: true });
  }

  $("#sign-in").onclick = () => { if (client) client.requestAccessToken(); };
  menu.addEventListener("toggle", () => { if (menu.open && clientId && !me) ready(); });
  $("#sign-out").onclick = () => {
    clearTimeout(saving);
    me = null; keep(); show(); menu.open = false;
  };

  if (!clientId) me = null;
  show();
  if (live()) syncing();
  else if (me) waitForClick();

  return {
    // a setting the shell just wrote: saved to Drive now, or at the next sync when there is no token
    changed(key) {
      if (!me || !keys.includes(key)) return;
      me.changed = true; keep();
      if (!live()) return;
      clearTimeout(saving);
      saving = setTimeout(() => save().catch((e) => console.warn("settings not saved to Google Drive:", e.message)), SAVE_AFTER_MS);
    },
  };
}
