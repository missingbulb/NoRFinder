// A study's ground truth in the remote store (req/shell/ground-truth/folders, req/shell/ground-truth/layout): a submissions
// folder taggers write to and a curated folder only Study Managers write to, the same folder twice for free submission.
// Both hold one subfolder per image and one file per tagger in it. Reading goes through `reader` (the public folders,
// no sign-in: all(folder) as [{id, name, folder, modified, properties}], text(id)); writing through `writer` (the
// signed-in user's: folder(parent, name), create(parent, name, blob), replace(id, blob, {keepForever}),
// mark(id, properties)).
"use strict";

const FILE = /^gt_.+\.json$/;
const stem = (name) => name.replace(/\.[^.]*$/, "");
const time = (s) => { const t = Date.parse(s); return Number.isNaN(t) ? null : t; };

// the image's subfolder: its stem and the first 8 hex of its SHA-256
export const subfolderName = (name, sha) => `${stem(name)}__${sha.slice(0, 8)}`;
// the tagger's file in it
export const taggerFile = (email) => `gt_${email.toLowerCase()}.json`;

// {submissions, curated, same} as folder ids, each null while the study has none, from its root's settings
// (study_root.js read) or null
export function folders(settings) {
  const submissions = settings?.submissions || null, curated = settings?.curated || null;
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

// Map(subfolder name -> {curated, pending, rejected}) over every image either folder holds ground truth for, from the
// two folders' listings alone (req/shell/ground-truth/pending): curated, the curated folder holds its subfolder;
// pending, its submissions subfolder was stamped submitted after its last acceptance and rejection; rejected, its last
// submission was rejected and nothing is curated
export async function status({ all }, { submissions, curated, same }) {
  const cur = new Set((await all(curated)).filter((f) => f.folder).map((f) => f.name)), out = new Map();
  for (const name of cur) out.set(name, { curated: true, pending: false, rejected: false });
  if (same) return out;
  for (const sub of (await all(submissions)).filter((f) => f.folder)) {
    const p = sub.properties || {}, put = time(p.submitted);
    if (put === null) continue;
    const isCurated = cur.has(sub.name), last = Math.max(time(p.accepted) ?? -Infinity, time(p.rejected) ?? -Infinity);
    out.set(sub.name, { curated: isCurated, pending: put > last, rejected: !isCurated && (time(p.rejected) ?? -Infinity) >= put });
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

// the tagger's ground truth doc written into the submissions folder, its image's subfolder stamped submitted at at
export async function submit({ reader, writer, folder, image, email, doc, at = new Date() }) {
  const sub = await ensure(reader, writer, folder, image), done = await put(reader, writer, sub, taggerFile(email), JSON.stringify(doc, null, 1));
  await writer.mark(sub, { submitted: at.toISOString() });
  return done;
}
// the image's submissions subfolder stamped with what a study manager did, at at
async function stamp(reader, writer, submissions, image, what, at) {
  const sub = await subfolder(reader, submissions, image);
  if (sub) await writer.mark(sub.id, { [what]: at.toISOString() });
}

async function sha256(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// a submission (file, as files() lists it) copied into the curated folder under its own name, recording which
// submission it was and who accepted it when
export async function accept({ reader, writer, folders: { curated, submissions }, image, file, by, at = new Date() }) {
  const text = await reader.text(file.id), doc = JSON.parse(text);
  doc.accepted = { by, at: at.toISOString(), from_sha256: await sha256(text), from_id: file.id };
  const done = await put(reader, writer, await ensure(reader, writer, curated, image), file.name, JSON.stringify(doc, null, 1));
  await stamp(reader, writer, submissions, image, "accepted", at);
  return done;
}

// a submission marked rejected, with the reason its tagger sees, its image's subfolder stamped rejected at at
export async function reject({ reader, writer, folders: { submissions }, image, file, reason = "", at = new Date() }) {
  await writer.mark(file.id, { rejected: "yes", reason });
  await stamp(reader, writer, submissions, image, "rejected", at);
}
