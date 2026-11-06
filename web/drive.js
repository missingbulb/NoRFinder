// "Load from Google Drive": the user pastes the link of an image or a folder. Google answers a page on another site
// only through the Drive API (its plain download link refuses any request a browser marks cross-site), and every read
// carries one credential (req/shell/drive/credentials): signed in, the user's own token alone, reaching whatever their
// account can see; signed out, the site's API key (NOR_CONFIG.google.apiKey, written into config.js at deploy),
// reaching what is shared as "Anyone with the link". This module keeps nothing: the file goes to the study like one
// loaded from the computer.
"use strict";
window.NorDrive = (() => {
  const key = ((window.NOR_CONFIG && window.NOR_CONFIG.google) || {}).apiKey || "";
  const API = "https://www.googleapis.com/drive/v3/files";
  // the bytes Drive's answers have brought, for the status bar's network: Google does not let a page read their size;
  // and the files downloaded whole, {bytes, ms}, for how fast Drive answers
  let received = 0;
  const timed = { bytes: 0, ms: 0 };
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
  const throttled = () => Object.assign(new Error("Google is throttling this site's downloads"), { throttled: true });
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
    const t0 = performance.now(), r = await download(id);
    if (onStart) onStart(name);
    const done = (bytes) => { timed.bytes += bytes.byteLength; timed.ms += performance.now() - t0; return bytes; };
    const total = +r.headers.get("content-length") || null;
    if (!onChunk || !r.body) return { name, bytes: done(await r.arrayBuffer()) };
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
    return { name, bytes: done(got === buf.byteLength ? buf : buf.slice(0, got)) };
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

  // [{id, name, folder, size, created, preview, sha}] in a folder: its subfolders and its TIFF and PNG
  // images; size in bytes (null for a folder), created a Date, preview the link of Drive's own small
  // picture of the file or null (Drive draws a multi-channel TIFF grey, so it serves only a PNG), sha its
  // SHA-256 or null when Drive gives none
  async function list(id) {
    need();
    const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
    const r = await get(`${API}?q=${q}&fields=files(id,name,mimeType,size,createdTime,thumbnailLink,sha256Checksum)&pageSize=1000&orderBy=folder,name`);
    if (!r.ok) throw refused(r, "folder");
    return (await r.json()).files
      .map((f) => ({ id: f.id, name: f.name, folder: f.mimeType === "application/vnd.google-apps.folder",
        size: f.size == null ? null : +f.size, created: f.createdTime ? new Date(f.createdTime) : null,
        preview: f.thumbnailLink && /\.png$/i.test(f.name) ? f.thumbnailLink : null, sha: f.sha256Checksum || null }))
      .filter((f) => f.folder || /\.(tiff?|png)$/i.test(f.name));
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

  // a file's or a folder's name
  async function name(id) {
    need();
    const r = await get(`${API}/${encodeURIComponent(id)}?fields=name`);
    if (!r.ok) throw refused(r, "folder");
    return (await r.json()).name;
  }

  return { use: (s) => { signIn = s; }, signedIn, parse, file, head, checksum, list, all, name, ready: !!key, received: () => received, speed: () => ({ ...timed }) };
})();
