// Signing in with Google (1.48), from the avatar's menu: the site's server (/api/) says whether this browser
// has a session and which Google client signs in, and keeps the signed-in user's one settings record, the
// strings this device keeps under the browser keys that follow the user. Google's sign-in script is loaded
// only when a visitor who is not signed in opens the menu.
"use strict";
const API = "/api/";
const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";
const SAVE_AFTER_MS = 400;

// keys: the browser keys whose settings follow the user; applied(): runs once the record has replaced them
export function account({ keys, menu, applied }) {
  const $ = (s) => menu.querySelector(s);
  let user = null, clientId = null, saving = null, google = null;
  const call = (path, method = "GET", body) => fetch(API + path, {
    method, credentials: "same-origin", cache: "no-store", keepalive: method !== "GET",
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });

  const here = () => {
    const out = {};
    for (const k of keys) { try { const v = localStorage.getItem(k); if (v !== null) out[k] = v; } catch { /* no storage */ } }
    return out;
  };
  // the record replaces this device's settings: a key it lacks is one the user never set
  const apply = (record) => {
    for (const k of keys) {
      try { if (k in record) localStorage.setItem(k, record[k]); else localStorage.removeItem(k); } catch { /* no storage */ }
    }
    applied();
  };
  const save = () => call("settings", "PUT", here()).then((r) => { if (!r.ok) console.warn("settings not saved:", r.status); }, (e) => console.warn("settings not saved:", e));

  const show = () => {
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

  const signedIn = (answer) => {
    user = answer.user;
    if (answer.settings) apply(answer.settings);
    else save(); // a first sign-in: this device's settings start the record
    show();
  };
  // Google's button, drawn the first time the menu opens with someone to sign in
  const offer = () => {
    if (user || !clientId || google) return;
    google = new Promise((ok, fail) => document.head.append(Object.assign(document.createElement("script"), { src: GOOGLE_SCRIPT, async: true, onload: ok, onerror: fail })))
      .then(() => {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            const r = await call("session", "POST", { credential });
            if (r.ok) signedIn(await r.json()); else console.warn("sign-in refused:", r.status);
          },
        });
        window.google.accounts.id.renderButton($("#sign-in"), { type: "standard", text: "signin_with", size: "medium", width: 200 });
      })
      .catch((e) => { google = null; console.warn("Google sign-in did not load:", e); });
  };
  menu.addEventListener("toggle", () => { if (menu.open) offer(); });
  $("#sign-out").onclick = async () => {
    clearTimeout(saving);
    await call("session", "DELETE").catch(() => {});
    window.google?.accounts?.id?.disableAutoSelect?.();
    user = null; show(); menu.open = false;
  };

  // a page served without the site's server (a local preview) has no sign-in
  call("session").then((r) => (r.ok ? r.json() : null)).then((answer) => {
    if (!answer) return;
    clientId = answer.clientId || null;
    if (answer.user) signedIn(answer); else show();
    if (menu.open) offer();
  }).catch(() => { /* no server: anonymous only */ });

  return {
    // a setting the shell just wrote: saved for the signed-in user, the whole record at once
    changed(key) {
      if (!user || !keys.includes(key)) return;
      clearTimeout(saving);
      saving = setTimeout(save, SAVE_AFTER_MS);
    },
  };
}
