// "Load from Google Drive": the user signs in with Google, picks one image in Google's own file
// picker, and the browser reads that file straight from Drive. Nothing is kept: the file goes to
// the finder like one loaded from the computer. The access asked for (drive.file) covers only the
// files the user picks. Needs NOR_CONFIG.google (config.js).
"use strict";
window.NorDrive = (() => {
  const cfg = (window.NOR_CONFIG && window.NOR_CONFIG.google) || {};
  const configured = () => !!(cfg.apiKey && cfg.clientId && cfg.appId);
  let token = null, ready = null;

  const script = (src) => new Promise((ok, fail) => {
    const s = document.createElement("script"); s.src = src; s.async = true;
    s.onload = ok; s.onerror = () => fail(new Error("could not reach Google (" + new URL(src).host + ")"));
    document.head.append(s);
  });
  const boot = () => (ready ||= Promise.all([script("https://apis.google.com/js/api.js"), script("https://accounts.google.com/gsi/client")])
    .then(() => new Promise((ok) => gapi.load("picker", ok))));

  const signIn = () => new Promise((ok, fail) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId, scope: "https://www.googleapis.com/auth/drive.file",
      callback: (r) => (r.error ? fail(new Error(r.error_description || r.error)) : ok((token = r.access_token))),
      error_callback: (e) => fail(new Error(e.message || e.type || "sign-in was closed")),
    });
    client.requestAccessToken({ prompt: token ? "" : "consent" });
  });

  const choose = () => new Promise((ok) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes("image/tiff,image/png").setIncludeFolders(true);
    new google.picker.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(cfg.apiKey).setAppId(cfg.appId)
      .setCallback((d) => {
        if (d.action === google.picker.Action.PICKED) ok(d.docs[0]);
        else if (d.action === google.picker.Action.CANCEL) ok(null);
      }).build().setVisible(true);
  });

  // resolves {name, bytes} for the picked file, or null when the user closes the picker
  async function pick(say) {
    if (!configured()) throw new Error("not set up on this site");
    say("Opening Google Drive…"); await boot(); await signIn();
    const doc = await choose(); if (!doc) { say("Ready."); return null; }
    say("Downloading " + doc.name + " from Google Drive…");
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(doc.id)}?alt=media`, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) throw new Error(`download failed (${r.status})`);
    return { name: doc.name, bytes: await r.arrayBuffer() };
  }
  return { configured, pick };
})();
