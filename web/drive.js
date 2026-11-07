// Everything the page knows of Google Drive, behind one storage-neutral interface, `remote`: the rest of the page
// opens, lists and writes "the remote store" and never learns it is Drive. Google answers a page on another site only
// through the Drive API (its plain download link refuses any request a browser marks cross-site), and every read
// carries one credential (req/shell/drive/credentials): signed in, the user's own token alone, reaching whatever their
// account can see; signed out, the site's API key (NOR_CONFIG.google.apiKey, written into config.js at deploy),
// reaching what is shared as "Anyone with the link". Writes (req/shell/data/drive-access) go only to a study's own
// folders the user approved in Google's picker, with Google's per-file permission: the page only creates files, each
// marked as its own, and changes or trashes only the files so marked. Reading keeps nothing: a file goes to the study
// like one loaded from the computer.
"use strict";

const GOOGLE = (window.NOR_CONFIG && window.NOR_CONFIG.google) || {};
// what a study's image from Drive is, as its source records it on this device and in the documents it writes
const KIND = "drive";
// Google's per-file permission, which lets the page write in the folders approved for it
const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const PICKER_SCRIPT = "https://apis.google.com/js/api.js";
const FOLDER = "application/vnd.google-apps.folder";
// the private property every file the page creates carries, which only this site's own reads see
const MINE = { rauntruth: "made" };
const THROTTLING = "Google is throttling this site's downloads";

// The bodies of Drive's uploads, written out as bytes, not a FormData or a Blob: Playwright's WebKit hands a page test
// a FormData or Blob body with its parts empty, where bytes arrive whole.
const encode = (t) => new TextEncoder().encode(t);
// A multipart upload (uploadType=multipart, documented as multipart/related): the file's details, then the file, in one
// request. details: the file's metadata; file: a string or a Blob; type: the file's content type. {headers, body}.
export async function multipart(details, file, type) {
  const cut = "rauntruth-" + Math.random().toString(36).slice(2);
  const head = encode(`--${cut}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(details)}\r\n--${cut}\r\nContent-Type: ${type}\r\n\r\n`);
  const content = typeof file === "string" ? encode(file) : new Uint8Array(await file.arrayBuffer());
  const tail = encode(`\r\n--${cut}--\r\n`);
  const body = new Uint8Array(head.length + content.length + tail.length);
  body.set(head, 0); body.set(content, head.length); body.set(tail, head.length + content.length);
  return { headers: { "content-type": `multipart/related; boundary=${cut}` }, body: body.buffer };
}
// A media upload (uploadType=media): the file's content alone, a Blob. {headers, body}.
const media = async (blob) => ({ headers: { "content-type": blob.type || "application/octet-stream" }, body: await blob.arrayBuffer() });

export const remote = (() => {
  const key = GOOGLE.apiKey || "";
  const API = "https://www.googleapis.com/drive/v3/files";
  // the bytes Drive's answers have brought, for the status bar's network: Google does not let a page read their size
  let received = 0;
  // the sign-in (account.js), once the page hands it over: {signedIn(), token(), refused()}
  let signIn = null;
  const signedIn = () => !!signIn?.signedIn();
  const get = async (url, init = {}) => {
    const u = new URL(url), mine = signedIn();
    if (mine) {
      const token = signIn.token();
      if (!token) throw new Error("Your Google sign-in has run out: press a Google Drive button again to renew it");
      init = { ...init, headers: { ...init.headers, authorization: "Bearer " + token } };
    } else u.searchParams.set("key", key);
    u.searchParams.set("supportsAllDrives", "true");
    if (u.searchParams.has("q")) u.searchParams.set("includeItemsFromAllDrives", "true");
    const r = await fetch(u, init);
    if (mine && r.status === 401) signIn.refused();
    return r.body ? new Response(r.body.pipeThrough(new TransformStream({ transform(c, out) { received += c.byteLength; out.enqueue(c); } })), r) : r;
  };

  // {kind: "file" | "folder", id} from any Drive link; a bare id is looked up
  function parse(link) {
    const s = link.trim();
    let m = s.match(/\/folders\/([\w-]{10,})/);
    if (m) return { kind: "folder", id: m[1] };
    m = s.match(/\/file\/d\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/) || s.match(/^([\w-]{20,})$/);
    return m ? { kind: "file", id: m[1] } : null;
  }

  const need = () => { if (!key && !signedIn()) throw new Error("this site has no Google API key yet (issue #234)"); };
  const refused = (r, what) => new Error(signedIn()
    ? r.status === 404 ? `Your Google account cannot see this ${what}` : `Drive refused the ${what} (${r.status}) to your Google account`
    : r.status === 400 ? `Google refused this site's API key (${r.status})`
      : `Drive refused the ${what} (${r.status}): is it shared as "Anyone with the link"? Signed in, you can open any your account can see`);

  // Google answers a burst of downloads by refusing the site's for a while, without the header that lets a page
  // read the refusal: a download that fails while the file's details still answer is that, an Error with
  // throttled set
  const throttled = () => Object.assign(new Error(THROTTLING), { throttled: true });
  async function download(id, init = {}) {
    const at = `${API}/${encodeURIComponent(id)}`;
    let r;
    try { r = await get(`${at}?alt=media`, init); } catch (e) {
      if (e.name !== "AbortError" && (await get(`${at}?fields=id`, { signal: init.signal }).then((d) => d.ok, () => false))) throw throttled();
      throw e;
    }
    if (r.status === 403 && /rateLimitExceeded|downloadQuotaExceeded/.test(await r.clone().text())) throw throttled();
    if (!r.ok) throw refused(r, "file");
    return r;
  }

  // onStart(name) runs once the download begins and onChunk(buffer, got, total) as each piece arrives,
  // the bytes so far at the start of buffer; total is null when Drive does not say
  async function file(id, name, onStart, onChunk) {
    need();
    const at = `${API}/${encodeURIComponent(id)}`;
    if (!name) {
      const r = await get(`${at}?fields=name,mimeType`);
      if (!r.ok) throw refused(r, "file");
      const f = await r.json();
      if (f.mimeType === "application/vnd.google-apps.folder") return { folder: true, id, name: f.name };
      name = f.name;
    }
    const r = await download(id);
    if (onStart) onStart(name);
    const total = +r.headers.get("content-length") || null;
    if (!onChunk || !r.body) return { name, bytes: await r.arrayBuffer() };
    let buf = new ArrayBuffer(total || 1 << 20), got = 0;
    for (const reader = r.body.getReader(); ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      if (got + value.length > buf.byteLength) {
        const more = new ArrayBuffer(Math.max(2 * buf.byteLength, got + value.length));
        new Uint8Array(more).set(new Uint8Array(buf, 0, got)); buf = more;
      }
      new Uint8Array(buf, got).set(value); got += value.length;
      onChunk(buf, got, total);
    }
    return { name, bytes: got === buf.byteLength ? buf : buf.slice(0, got) };
  }

  // the first n bytes of a file, as an ArrayBuffer
  async function head(id, n, signal) {
    need();
    return (await download(id, { headers: { Range: `bytes=0-${n - 1}` }, signal })).arrayBuffer();
  }

  // a file's SHA-256 as Drive gives it, null when it gives none
  async function checksum(id) {
    need();
    const r = await get(`${API}/${encodeURIComponent(id)}?fields=sha256Checksum`);
    if (!r.ok) throw refused(r, "file");
    return (await r.json()).sha256Checksum || null;
  }

  // [{id, name, folder, size, created, preview, sha}] in a folder: its subfolders and the files whose extension accept
  // names, a study's files.accept (".tif,.tiff,.png"); size in bytes (null for a folder), created a Date, preview the link of Drive's own small
  // picture of the file or null (Drive draws a multi-channel TIFF grey, so it serves only a PNG), sha its
  // SHA-256 or null when Drive gives none
  async function list(id, accept) {
    need();
    const opens = new Set(accept.split(",").map((e) => e.trim().toLowerCase()));
    const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
    const r = await get(`${API}?q=${q}&fields=files(id,name,mimeType,size,createdTime,thumbnailLink,sha256Checksum)&pageSize=1000&orderBy=folder,name`);
    if (!r.ok) throw refused(r, "folder");
    return (await r.json()).files
      .map((f) => ({ id: f.id, name: f.name, folder: f.mimeType === "application/vnd.google-apps.folder",
        size: f.size == null ? null : +f.size, created: f.createdTime ? new Date(f.createdTime) : null,
        preview: f.thumbnailLink && /\.png$/i.test(f.name) ? f.thumbnailLink : null, sha: f.sha256Checksum || null }))
      .filter((f) => f.folder || opens.has((f.name.match(/\.[^.]+$/) || [""])[0].toLowerCase()));
  }

  // [{id, name, folder, size, sha, modified, properties}] every file and folder in a folder, whatever its kind,
  // every page of them; modified Drive's time of its last change, properties its public ones
  async function all(id) {
    need();
    const q = encodeURIComponent(`'${id}' in parents and trashed = false`), out = [];
    for (let page = ""; ; ) {
      const r = await get(`${API}?q=${q}&fields=nextPageToken,files(id,name,mimeType,size,sha256Checksum,modifiedTime,properties)&pageSize=1000&orderBy=folder,name${page && "&pageToken=" + page}`);
      if (!r.ok) throw refused(r, "folder");
      const got = await r.json();
      out.push(...got.files.map((f) => ({ id: f.id, name: f.name, folder: f.mimeType === "application/vnd.google-apps.folder",
        size: f.size == null ? null : +f.size, sha: f.sha256Checksum || null, modified: f.modifiedTime || null, properties: f.properties || {} })));
      if (!(page = got.nextPageToken)) return out;
    }
  }

  // whether the signed-in user may add files to folder id, as Drive answers their token: true, false, or null when
  // nobody is signed in or Drive does not say (req/shell/data/roles)
  async function canWrite(id) {
    if (!signedIn()) return null;
    const r = await get(`${API}/${encodeURIComponent(id)}?fields=capabilities(canAddChildren)&supportsAllDrives=true`);
    if (r.status === 404 || r.status === 403) return false;
    if (!r.ok) return null;
    return !!(await r.json()).capabilities?.canAddChildren;
  }

  // a file's or a folder's name
  async function name(id) {
    need();
    const r = await get(`${API}/${encodeURIComponent(id)}?fields=name`);
    if (!r.ok) throw refused(r, "folder");
    return (await r.json()).name;
  }


  // The writer for a study's own folders, for a signed-in user: account the sign-in (account.js)
  function writer(account) {
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
    return {
      // "write", "view" (approved, but Drive gives the user no more than a view), "none" (not approved for this
      // site), or null when it cannot tell now (no live token)
      async access(id) {
        if (!account.may(DRIVE_FILE)) return "none";
        if (!account.token()) return null;
        try {
          const f = await (await google(`${API}/${encodeURIComponent(id)}?fields=id,capabilities(canAddChildren)&supportsAllDrives=true`)).json();
          return f.capabilities?.canAddChildren ? "write" : "view";
        } catch (e) {
          if (e.status === 404 || e.status === 403) return "none";
          throw e;
        }
      },
      // In the user's click: Google's per-file permission, then its picker on just these folders ([{id, name}]) to
      // approve all or some. Resolves once the picker closes; false when the user gave no permission.
      async approve(folders) {
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
            .setOAuthToken(token()).setDeveloperKey(key).setAppId((GOOGLE.clientId || "").split("-")[0])
            .setCallback((d) => { if (d.action === p.Action.PICKED || d.action === p.Action.CANCEL) ok(true); })
            .build().setVisible(true);
        });
      },
      // a new file in folder parent: its id
      async create(parent, name, blob) {
        const upload = await multipart({ name, parents: [parent], appProperties: MINE }, blob, blob.type || "application/octet-stream");
        return (await (await google(`${UPLOAD}?uploadType=multipart&fields=id,sha256Checksum&supportsAllDrives=true`, { method: "POST", ...upload })).json());
      },
      // a new folder in folder parent, the page's own: its id
      async folder(parent, name) {
        return (await (await google(`${API}?fields=id&supportsAllDrives=true`, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent], appProperties: MINE }) })).json()).id;
      },
      // whether the page made the file, and so may change it
      async ours(id) {
        try {
          const f = await (await google(`${API}/${encodeURIComponent(id)}?fields=appProperties&supportsAllDrives=true`)).json();
          return f.appProperties?.rauntruth === MINE.rauntruth;
        } catch (e) { if (e.status === 404 || e.status === 403) return false; throw e; }
      },
      // new bytes for a file the page made; keepForever: Drive keeps the version replaced for good, not for its 30 days
      async replace(id, blob, { keepForever = false } = {}) {
        return (await (await google(`${UPLOAD}/${encodeURIComponent(id)}?uploadType=media&fields=id,sha256Checksum&supportsAllDrives=true${keepForever ? "&keepRevisionForever=true" : ""}`, { method: "PATCH", ...(await media(blob)) })).json());
      },
      // public properties set on a file the page made, which a reader with no sign-in sees too
      async mark(id, properties) {
        await google(`${API}/${encodeURIComponent(id)}?supportsAllDrives=true`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ properties }) });
      },
      // a folder the page made, shared with anyone with its link to view (req/shell/ground-truth/setup)
      async share(id) {
        await google(`${API}/${encodeURIComponent(id)}/permissions?supportsAllDrives=true`, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "anyone", role: "reader" }) });
      },
      // a file the page made, to Drive's bin
      async trash(id) {
        await google(`${API}/${encodeURIComponent(id)}?supportsAllDrives=true`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashed: true }) });
      },
    };
  }

  // the parts of a study's study.json that name Drive: whether its images open from the store, its root folder's id
  // (null for none), and the path of its ready-made thumbnails (driveThumbs) or null
  const study = (m) => {
    const r = m?.root ? parse(m.root) : null;
    return { opens: !!m?.files?.from?.includes(KIND), root: r?.kind === "folder" ? r.id : null, thumbs: m?.driveThumbs || null };
  };

  return {
    // what the page calls the store, in full and short
    label: "Google Drive", short: "Drive",
    // the store's logo, an SVG <symbol> the page's sprite takes in, of this id
    logo: { id: "remote-logo", symbol: '<symbol id="remote-logo" viewBox="0 0 24 21"><path fill="#0f9d58" d="M8 0l4 7-8 14-4-7z"/><path fill="#ffba00" d="M8 0h8l8 14h-8z"/><path fill="#4285f4" d="M8 14h16l-4 7H4z"/></symbol>' },
    // the words the page shows about the store
    words: {
      hint: (signed) => (signed ? "Paste the link of an image or a folder your Google account can see."
        : 'Paste the link of an image or a folder shared as "Anyone with the link".'),
      placeholder: "https://drive.google.com/…",
      notLink: "That does not look like a Google Drive link.",
      unready: "Needs this site's Google API key (issue #234)",
      noKey: "needs this site's Google API key",
      throttling: THROTTLING,
      throttled: THROTTLING + ". Try again in 15 minutes.",
    },
    use: (s) => { signIn = s; }, signedIn, parse, file, head, checksum, list, all, name, canWrite, writer, study,
    ready: !!key, received: () => received,
    // an image from the store, as a source records it; whether a source is one
    source: (id, more = {}) => ({ kind: KIND, id, ...more }),
    owns: (src) => src?.kind === KIND,
    // what a document records of where an image from the store is: the id field it carries, and its full location
    cite: (src) => ({ drive_id: src.id }),
    locate: (src) => ({ source: KIND, drive_id: src.id, url: `https://drive.google.com/file/d/${src.id}/view` }),
  };
})();
