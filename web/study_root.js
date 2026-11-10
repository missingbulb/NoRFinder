// A study's root folder in the remote store (req/shell/data/roles, req/shell/ground-truth/setup): the one folder its
// study.json names, and the settings file in it that names the folders under it by id. A root with no settings file
// has its folders found by name. read() is cached a minute per root; setup() makes what is missing and writes the
// file. reader: all(folder) as [{id, name, folder}], text(id); writer: folder(parent, name), create(parent, name,
// blob), replace(id, blob), share(id) (anyone with the link may view).
"use strict";

export const SETTINGS = "rauntruth-study.json";
export const FORMAT = "rauntruth-study/1";
// the names a folder is found by, lower-cased, best first, while the settings file does not name it
const NAMES = { data: ["data"], curated: ["gt curated", "gt"], submissions: ["gt submissions", "gt"], previews: ["previews"] };
// the names setup() and previewsFolder() give the folders they make
const MADE = { curated: "GT curated", submissions: "GT submissions", both: "GT", previews: "Previews" };
const KEEP_MS = 60e3;
const known = new Map();

const byName = (items, names) => {
  for (const n of names) {
    const f = items.find((x) => x.folder && x.name.trim().toLowerCase() === n);
    if (f) return f.id;
  }
  return null;
};

// {root, data, curated, submissions, previews, same, review, set, file}: the folders under root by id, each null while there is
// none; set whether the settings file named them; file its id or null. fresh: read past the minute's copy.
export async function read(reader, root, { fresh = false } = {}) {
  const kept = known.get(root);
  if (!fresh && kept && Date.now() - kept.at < KEEP_MS) return kept.value;
  const items = await reader.all(root), file = items.find((f) => !f.folder && f.name === SETTINGS) || null;
  let doc = null;
  if (file) try { doc = JSON.parse(await reader.text(file.id)); } catch { doc = null; }
  // the file names a folder by id, wherever it now lives; the names count only where it names none
  const pick = (k) => doc?.[k] || byName(items, NAMES[k]);
  const curated = pick("curated"), submissions = pick("submissions");
  const value = { root, data: pick("data"), curated, submissions, previews: pick("previews"), same: !!curated && curated === submissions,
    review: doc ? !!doc.review : !!curated && curated !== submissions, set: !!doc?.curated, file: file?.id ?? null };
  known.set(root, { at: Date.now(), value });
  return value;
}

// The study's ground-truth folders made where missing, the curated one shared to view, and the settings file
// written: review, two folders, else one for both. by: who set it up; at: when. Returns read()'s answer afresh.
export async function setup({ reader, writer, root, review, by, at = new Date() }) {
  const was = await read(reader, root, { fresh: true });
  let curated, submissions;
  if (review) {
    curated = was.curated && !was.same ? was.curated : await writer.folder(root, MADE.curated);
    submissions = was.submissions && !was.same ? was.submissions : await writer.folder(root, MADE.submissions);
  } else {
    curated = submissions = was.same ? was.curated : await writer.folder(root, MADE.both);
  }
  await writer.share(curated);
  const doc = { format: FORMAT, data: was.data, curated, submissions, review: !!review, set_by: by, set_at: at.toISOString() };
  const blob = new Blob([JSON.stringify(doc, null, 1)], { type: "application/json" });
  if (was.file) await writer.replace(was.file, blob); else await writer.create(root, SETTINGS, blob);
  known.delete(root);
  return read(reader, root, { fresh: true });
}

// A set-up study switched between reviewed and unreviewed (req/shell/ground-truth/switch), no file moved, copied or
// deleted: to one folder, the curated one serves as both; to review, the one folder is curated and a GT submissions
// folder is found by name, else made. The settings file keeps who set it up and records the mode before, who
// switched and when. Returns read()'s answer afresh.
export async function switchMode({ reader, writer, root, review, by, at = new Date() }) {
  const was = await read(reader, root, { fresh: true });
  if (!was.set || !was.file) throw new Error("The study's ground truth is not set up yet.");
  if (!!review === !was.same) return was;
  let doc = {};
  try { doc = JSON.parse(await reader.text(was.file)) || {}; } catch { doc = {}; }
  const curated = was.curated;
  let submissions = curated;
  if (review) {
    const there = (await reader.all(root)).find((f) => f.folder && f.id !== curated && f.name.trim().toLowerCase() === MADE.submissions.toLowerCase());
    submissions = there ? there.id : await writer.folder(root, MADE.submissions);
  }
  const next = { ...doc, format: FORMAT, data: was.data, curated, submissions, review: !!review,
    switched: { from: { review: !was.same, curated: was.curated, submissions: was.submissions }, by, at: at.toISOString() } };
  await writer.replace(was.file, new Blob([JSON.stringify(next, null, 1)], { type: "application/json" }));
  known.delete(root);
  return read(reader, root, { fresh: true });
}

// a data folder's previews file, in the root's Previews folder, named by the data folder's id
export const previewsName = (folder) => `${folder}.tiff`;

// the root's Previews folder, made when it has none: its id
export async function previewsFolder({ reader, writer, root }) {
  const was = await read(reader, root, { fresh: true });
  if (was.previews) return was.previews;
  const id = await writer.folder(root, MADE.previews);
  known.delete(root);
  return id;
}

// The study on show's place in the remote store, for the page: remote the store, manifest() the study.
// Its reads are the store's own, as the signed-in user where anyone is (req/shell/drive/credentials).
export function studyPlace(remote, manifest) {
  const reader = { all: (id) => remote.all(id), text: async (id) => new TextDecoder().decode((await remote.file(id, SETTINGS)).bytes) };
  const root = () => remote.study(manifest()).root;
  const settings = async ({ fresh = false } = {}) => (root() ? read(reader, root(), { fresh }) : null);
  // the Previews folder's listing, once a minute at most: {at, folder, items}
  let previews = null;
  return {
    reader, root, settings,
    // the store's entry for a data folder's previews file, null for none, undefined when the store could not say;
    // fresh: read past the minute's copy
    async previewsOf(folder, { fresh = false } = {}) {
      try {
        const s = await settings({ fresh });
        if (!s?.previews) return null;
        if (fresh || !previews || previews.folder !== s.previews || Date.now() - previews.at >= KEEP_MS) previews = { at: Date.now(), folder: s.previews, items: await reader.all(s.previews) };
        return previews.items.find((f) => !f.folder && f.name === previewsName(folder)) || null;
      } catch (e) { console.warn("the study's previews could not be listed:", e); return undefined; }
    },
    // what was written into the root or its Previews folder, read afresh next time
    forgetPreviews() { previews = null; if (root()) known.delete(root()); },
    // the folders Load browses: the data folder, else the root while the root names none; [] for a study with no root
    async dataFolders() {
      if (!root()) return [];
      try { return [(await settings()).data || root()]; } catch { return [root()]; }
    },
    // {manager, tagger}: whether the store lets the signed-in user write to the root and to the submissions folder
    // (req/shell/data/roles); both false for nobody signed in or a study with no root
    async roles() {
      if (!root() || !remote.signedIn()) return { manager: false, tagger: false };
      const s = await settings().catch(() => null);
      const [manager, tagger] = await Promise.all([remote.canWrite(root()), s?.submissions ? remote.canWrite(s.submissions) : false]);
      return { manager: !!manager, tagger: !!tagger };
    },
  };
}
