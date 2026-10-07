// "Load from Google Drive": the user pastes the link of an image or a folder shared as "Anyone
// with the link", with no sign-in. Google answers a page on another site only through the Drive
// API with an API key (NOR_CONFIG.google.apiKey, written into config.js at deploy): its plain download link refuses any
// request a browser marks cross-site. Nothing is kept: the file goes to the finder like one loaded
// from the computer.
"use strict";
window.NorDrive = (() => {
  const key = ((window.NOR_CONFIG && window.NOR_CONFIG.google) || {}).apiKey || "";
  const API = "https://www.googleapis.com/drive/v3/files";

  // {kind: "file" | "folder", id} from any Drive link; a bare id is looked up
  function parse(link) {
    const s = link.trim();
    let m = s.match(/\/folders\/([\w-]{10,})/);
    if (m) return { kind: "folder", id: m[1] };
    m = s.match(/\/file\/d\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/) || s.match(/^([\w-]{20,})$/);
    return m ? { kind: "file", id: m[1] } : null;
  }

  const need = () => { if (!key) throw new Error("this site has no Google API key yet (issue #234)"); };
  const refused = (r, what) => new Error(r.status === 400
    ? `Google refused this site's API key (${r.status})`
    : `Drive refused the ${what} (${r.status}): is it shared as "Anyone with the link"?`);

  // onStart(name) runs once the download begins and onChunk(buffer, got, total) as each piece arrives,
  // the bytes so far at the start of buffer; total is null when Drive does not say
  async function file(id, name, onStart, onChunk) {
    need();
    const at = `${API}/${encodeURIComponent(id)}`;
    if (!name) {
      const r = await fetch(`${at}?fields=name,mimeType&key=${key}`);
      if (!r.ok) throw refused(r, "file");
      const f = await r.json();
      if (f.mimeType === "application/vnd.google-apps.folder") return { folder: true, id, name: f.name };
      name = f.name;
    }
    const r = await fetch(`${at}?alt=media&key=${key}`);
    if (!r.ok) throw refused(r, "file");
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

  // [{id, name, folder, size, created, preview}] in a public folder: its subfolders and its TIFF and PNG
  // images; size in bytes (null for a folder), created a Date, preview the link of Drive's own small
  // picture of the file or null (Drive draws a multi-channel TIFF grey, so it serves only a PNG)
  async function list(id) {
    need();
    const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
    const r = await fetch(`${API}?q=${q}&fields=files(id,name,mimeType,size,createdTime,thumbnailLink)&pageSize=1000&orderBy=folder,name&key=${key}`);
    if (!r.ok) throw refused(r, "folder");
    return (await r.json()).files
      .map((f) => ({ id: f.id, name: f.name, folder: f.mimeType === "application/vnd.google-apps.folder",
        size: f.size == null ? null : +f.size, created: f.createdTime ? new Date(f.createdTime) : null,
        preview: f.thumbnailLink && /\.png$/i.test(f.name) ? f.thumbnailLink : null }))
      .filter((f) => f.folder || /\.(tiff?|png)$/i.test(f.name));
  }

  return { parse, file, list, ready: !!key };
})();
