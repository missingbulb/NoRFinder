// A study's ground truth on Google Drive (req/shell/ground-truth/folders, req/shell/ground-truth/layout): a submissions
// folder taggers write to and a curated folder only Data Managers write to, the same folder twice for free submission.
// Both hold one subfolder per image and one file per tagger in it. Reading goes through `reader` (the public folders,
// no sign-in: all(folder) as [{id, name, folder, modified, properties}], text(id)); writing through `writer` (the
// signed-in user's: folder(parent, name), create(parent, name, blob), replace(id, blob, {keepForever}),
// mark(id, properties)).
"use strict";

const FILE = /^gt_.+\.json$/;
const folderId = (link) => (typeof link === "string" && (link.match(/\/folders\/([\w-]{10,})/) || [])[1]) || null;
const stem = (name) => name.replace(/\.[^.]*$/, "");
const time = (s) => { const t = Date.parse(s); return Number.isNaN(t) ? null : t; };

// the image's subfolder: its stem and the first 8 hex of its SHA-256
export const subfolderName = (name, sha) => `${stem(name)}__${sha.slice(0, 8)}`;
// the tagger's file in it
export const taggerFile = (email) => `gt_${email.toLowerCase()}.json`;

// {submissions, curated, same} as folder ids, each null while the study names none
export function folders(manifest) {
  const g = manifest?.groundTruth || {}, submissions = folderId(g.submissions), curated = folderId(g.curated);
  return { submissions, curated, same: !!submissions && submissions === curated };
}

async function subfolder(reader, folder, image) {
  const name = subfolderName(image.name, image.sha256);
  return (await reader.all(folder)).find((f) => f.folder && f.name === name) || null;
}
const entry = (f) => ({ id: f.id, name: f.name, modified: f.modified, rejected: f.properties?.rejected === "yes", reason: f.properties?.reason || "" });

// [{id, name, modified, rejected, reason}] the ground-truth files for the image in folder
export async function files(reader, folder, image) {
  const sub = await subfolder(reader, folder, image);
  return sub ? (await reader.all(sub.id)).filter((f) => !f.folder && FILE.test(f.name)).map(entry) : [];
}

// {id, name, doc} the image's ground truth in folder as a reader takes it: the file with the latest `created` that
// is not rejected; null when there is none. A file that does not read as ground truth is passed over.
export async function current(reader, folder, image) {
  let best = null;
  for (const f of (await files(reader, folder, image)).filter((g) => !g.rejected)) {
    let doc;
    try { doc = JSON.parse(await reader.text(f.id)); } catch { continue; }
    const t = time(doc?.created);
    if (t !== null && (!best || t > best.t)) best = { t, id: f.id, name: f.name, doc };
  }
  return best && { id: best.id, name: best.name, doc: best.doc };
}

// Map(subfolder name -> {curated, pending, rejected}) over every image either folder holds ground truth for; pending
// a submission not rejected newer than the image's curated file, or with none; rejected every submission rejected and
// nothing curated. Times here are Drive's, for a listing reads no file.
export async function status({ all }, { submissions, curated, same }) {
  const newest = async (folder) => {
    const out = new Map();
    for (const sub of (await all(folder)).filter((f) => f.folder)) {
      const gts = (await all(sub.id)).filter((f) => !f.folder && FILE.test(f.name)).map(entry);
      if (!gts.length) continue;
      const live = gts.filter((g) => !g.rejected).map((g) => time(g.modified) ?? 0);
      out.set(sub.name, { live: live.length ? Math.max(...live) : null });
    }
    return out;
  };
  const cur = await newest(curated), out = new Map();
  for (const [name, c] of cur) out.set(name, { curated: c.live !== null, pending: false, rejected: false });
  if (same) return out;
  for (const [name, s] of await newest(submissions)) {
    const c = cur.get(name), isCurated = !!c && c.live !== null;
    out.set(name, { curated: isCurated, pending: s.live !== null && (!isCurated || s.live > c.live), rejected: s.live === null && !isCurated });
  }
  return out;
}

// the subfolder for the image in folder, made when it has none: its id
async function ensure(reader, writer, folder, image) {
  return (await subfolder(reader, folder, image))?.id ?? (await writer.folder(folder, subfolderName(image.name, image.sha256)));
}
// name's bytes in the subfolder: the file there replaced, keeping its earlier version, else a new one
async function put(reader, writer, sub, name, text) {
  const blob = new Blob([text], { type: "application/json" }), there = (await reader.all(sub)).find((f) => !f.folder && f.name === name);
  return there ? writer.replace(there.id, blob, { keepForever: true }) : writer.create(sub, name, blob);
}

// the tagger's ground truth doc written into the submissions folder
export async function submit({ reader, writer, folder, image, email, doc }) {
  return put(reader, writer, await ensure(reader, writer, folder, image), taggerFile(email), JSON.stringify(doc, null, 1));
}

async function sha256(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// a submission (file, as files() lists it) copied into the curated folder under its own name, recording which
// submission it was and who accepted it when
export async function accept({ reader, writer, folders: { curated }, image, file, by, at = new Date() }) {
  const text = await reader.text(file.id), doc = JSON.parse(text);
  doc.accepted = { by, at: at.toISOString(), from_sha256: await sha256(text), from_id: file.id };
  return put(reader, writer, await ensure(reader, writer, curated, image), file.name, JSON.stringify(doc, null, 1));
}

// a submission marked rejected, with the reason its tagger sees
export function reject({ writer, file, reason = "" }) {
  return writer.mark(file.id, { rejected: "yes", reason });
}
