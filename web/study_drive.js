// A study's own Google Drive folders, for the signed-in user its permissions give a role (req/shell/data/roles, req/shell/data/drive-access):
// which folders the site may act in for them, asking Google for exactly those (its per-file permission, then its
// picker showing just the study's folders), and the writes the page makes there. The page only creates files,
// each marked as its own, and changes or trashes only the files so marked.
"use strict";

export const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";
// the roles a study's permissions may give
export const ROLES = ["data_management", "ground_truth_writer"];
const FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const PICKER_SCRIPT = "https://apis.google.com/js/api.js";
const FOLDER = "application/vnd.google-apps.folder";
// the private property every file the page creates carries, which only this site's own reads see
const MINE = { rauntruth: "made" };

// the roles the study's permissions give email
export function rolesOf(manifest, email) {
  const e = (email || "").toLowerCase(), held = manifest?.permissions || {};
  return new Set(ROLES.filter((r) => (held[r] || []).some((x) => x.toLowerCase() === e)));
}

// account: the sign-in (account.js); apiKey and clientId: the site's Google settings
export function studyDrive({ account, apiKey, clientId }) {
  let script = null;
  // a live token, or an Error asking for another click once Google has renewed it
  const token = () => {
    const t = account.token();
    if (t) return t;
    account.renew();
    throw new Error("Your Google sign-in ran out; it is being renewed. Please try again in a moment.");
  };
  // Google's answer, or an Error with Google's own words for a refusal
  async function google(url, init = {}) {
    const r = await fetch(url, { ...init, headers: { ...init.headers, authorization: "Bearer " + token() } });
    if (r.ok) return r;
    let why = "";
    try { why = (await r.json()).error?.message || ""; } catch { /* no words */ }
    throw Object.assign(new Error(`Google refused (${r.status})${why ? ": " + why : ""}`), { status: r.status });
  }

  // "write", "view" (approved, but Drive gives the user no more than a view), "none" (not approved for this site),
  // or null when it cannot tell now (no live token)
  async function access(id) {
    if (!account.may(DRIVE_FILE)) return "none";
    if (!account.token()) return null;
    try {
      const f = await (await google(`${FILES}/${encodeURIComponent(id)}?fields=id,capabilities(canAddChildren)&supportsAllDrives=true`)).json();
      return f.capabilities?.canAddChildren ? "write" : "view";
    } catch (e) {
      if (e.status === 404 || e.status === 403) return "none";
      throw e;
    }
  }

  // In the user's click: Google's per-file permission, then its picker on just these folders ([{id, name}]) to
  // approve all or some. Resolves once the picker closes; false when the user gave no permission.
  async function approve(folders) {
    if (!account.may(DRIVE_FILE) && !(await account.more(DRIVE_FILE))) return false;
    await (script ||= new Promise((ok, fail) => document.head.append(Object.assign(document.createElement("script"), { src: PICKER_SCRIPT, async: true, onload: ok, onerror: fail })))
      .then(() => new Promise((ok) => window.gapi.load("picker", ok)))
      .catch((e) => { script = null; throw e; }));
    const p = window.google.picker;
    return new Promise((ok) => {
      const view = new p.DocsView().setFileIds(folders.map((f) => f.id).join(",")).setIncludeFolders(true)
        .setSelectFolderEnabled(true).setMimeTypes(FOLDER).setMode(p.DocsViewMode.LIST);
      new p.PickerBuilder().addView(view).enableFeature(p.Feature.MULTISELECT_ENABLED)
        .setTitle("Choose the study's folders this site may work in")
        .setOAuthToken(token()).setDeveloperKey(apiKey).setAppId(clientId.split("-")[0])
        .setCallback((d) => { if (d.action === p.Action.PICKED || d.action === p.Action.CANCEL) ok(true); })
        .build().setVisible(true);
    });
  }

  return {
    access, approve,
    // a new file in folder parent: its id
    async create(parent, name, blob) {
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify({ name, parents: [parent], appProperties: MINE })], { type: "application/json" }));
      form.append("file", blob);
      return (await (await google(`${UPLOAD}?uploadType=multipart&fields=id,sha256Checksum&supportsAllDrives=true`, { method: "POST", body: form })).json());
    },
    // a new folder in folder parent, the page's own: its id
    async folder(parent, name) {
      return (await (await google(`${FILES}?fields=id&supportsAllDrives=true`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent], appProperties: MINE }) })).json()).id;
    },
    // whether the page made the file, and so may change it
    async ours(id) {
      try {
        const f = await (await google(`${FILES}/${encodeURIComponent(id)}?fields=appProperties&supportsAllDrives=true`)).json();
        return f.appProperties?.rauntruth === MINE.rauntruth;
      } catch (e) { if (e.status === 404 || e.status === 403) return false; throw e; }
    },
    // new bytes for a file the page made
    async replace(id, blob) {
      return (await (await google(`${UPLOAD}/${encodeURIComponent(id)}?uploadType=media&fields=id,sha256Checksum&supportsAllDrives=true`, { method: "PATCH", body: blob })).json());
    },
    // a file the page made, to Drive's bin
    async trash(id) {
      await google(`${FILES}/${encodeURIComponent(id)}?supportsAllDrives=true`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashed: true }) });
    },
  };
}
