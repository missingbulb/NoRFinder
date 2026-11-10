// Runs the ground-truth folders (web/truth_folders.js) under Node against an in-memory Drive, case by case, and
// prints each case's outcome as one JSON object for test_truth_folders.py to judge.
//   node web-tests/truth_folders_driver.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tf = await import(path.join(repo, "web", "truth_folders.js"));

// an in-memory Drive: the public reader's calls (all, text) and the signed-in writer's (create, folder, replace, mark)
function memoryDrive() {
  let n = 0, clock = Date.parse("2026-11-05T10:00:00Z");
  const files = [], lists = [];
  const add = (f) => { const g = { id: "id" + n++, properties: {}, modified: new Date(clock += 1000).toISOString(), ...f }; files.push(g); return g; };
  const reader = {
    all: async (parent) => (lists.push(parent), files.filter((f) => f.parent === parent && !f.trashed))
      .map((f) => ({ id: f.id, name: f.name, folder: !!f.folder, modified: f.modified, properties: { ...f.properties } })),
    text: async (id) => files.find((f) => f.id === id).body,
  };
  const writes = [];
  const writer = {
    folder: async (parent, name) => { writes.push(["folder", name]); return add({ parent, name, folder: true }).id; },
    create: async (parent, name, blob) => { writes.push(["create", name]); return { id: add({ parent, name, body: await blob.text() }).id }; },
    replace: async (id, blob, opts) => {
      const f = files.find((g) => g.id === id);
      writes.push(["replace", f.name, !!opts?.keepForever]); f.body = await blob.text(); f.modified = new Date(clock += 1000).toISOString(); return { id };
    },
    mark: async (id, properties) => { writes.push(["mark", files.find((g) => g.id === id).name]); Object.assign(files.find((g) => g.id === id).properties, properties); },
  };
  return { files, reader, writer, writes, add, lists };
}

const out = {};
const doc = (who, created, n = 1) => ({ format: "norfinder-ground-truth/2", created, tagger: who,
  image: { name: "slide3_s2.tif", sha256: "a1b2c3d4" + "0".repeat(56) }, labels: Array(n).fill({ label: 1 }) });
const IMG = { name: "slide3_s2.tif", sha256: "a1b2c3d4" + "0".repeat(56) };

out.names = { sub: tf.subfolderName(IMG.name, IMG.sha256), file: tf.taggerFile("Jane@Lab.org") };
out.folders = {
  two: tf.folders({ submissions: "SUBMISSIONS0001", curated: "CURATED0000001" }),
  one: tf.folders({ submissions: "SAMEFOLDER0001", curated: "SAMEFOLDER0001" }),
  none: tf.folders(null),
};

// submitting: the subfolder made once, the tagger's own file replaced, keeping the old version
{
  const d = memoryDrive();
  await tf.submit({ reader: d.reader, writer: d.writer, folder: "SUB", image: IMG, email: "jane@lab.org", doc: doc("jane@lab.org", "2026-11-05T10:00:00Z") });
  await tf.submit({ reader: d.reader, writer: d.writer, folder: "SUB", image: IMG, email: "jane@lab.org", doc: doc("jane@lab.org", "2026-11-05T11:00:00Z", 2) });
  await tf.submit({ reader: d.reader, writer: d.writer, folder: "SUB", image: IMG, email: "bob@lab.org", doc: doc("bob@lab.org", "2026-11-05T12:00:00Z", 3) });
  const cur = await tf.current(d.reader, "SUB", IMG);
  out.submit = { writes: d.writes, current: cur && { tagger: cur.doc.tagger, labels: cur.doc.labels.length, file: cur.name },
    subfolders: d.files.filter((f) => f.folder).length };
}

// the reader rule: newest `created` that is not rejected, whatever Drive's own times say
{
  const d = memoryDrive(), sub = d.add({ parent: "C", name: tf.subfolderName(IMG.name, IMG.sha256), folder: true });
  d.add({ parent: sub.id, name: "gt_new@x.org.json", body: JSON.stringify(doc("new@x.org", "2026-11-05T09:00:00Z")), properties: { rejected: "yes", reason: "wrong image" } });
  d.add({ parent: sub.id, name: "gt_old@x.org.json", body: JSON.stringify(doc("old@x.org", "2026-11-04T09:00:00Z")) });
  d.add({ parent: sub.id, name: "gt_mid@x.org.json", body: JSON.stringify(doc("mid@x.org", "2026-11-05T08:00:00Z")) });
  d.add({ parent: sub.id, name: "notes.txt", body: "not ground truth" });
  const cur = await tf.current(d.reader, "C", IMG);
  out.reader = { tagger: cur?.doc.tagger, none: await tf.current(d.reader, "C", { name: "other.tif", sha256: "f".repeat(64) }) };
}

// pending: from the two folders' listings alone, the stamps Submit, Accept and Reject leave on the image's submissions
// subfolder; one folder for both, never pending
{
  const d = memoryDrive(), F = { submissions: "S", curated: "C", same: false };
  const at = (h) => new Date(Date.UTC(2026, 10, 7, h));
  const im = (n, c) => ({ name: n + ".tif", sha256: c.repeat(64) });
  const A = im("a", "1"), B = im("b", "2"), C = im("c", "3");
  const put = (image, h) => tf.submit({ reader: d.reader, writer: d.writer, folder: "S", image, email: "j@x.org", doc: doc("j@x.org", at(h).toISOString()), at: at(h) });
  await put(A, 1);
  await put(B, 1);
  await tf.accept({ reader: d.reader, writer: d.writer, folders: F, image: B, file: (await tf.files(d.reader, "S", B))[0], by: "dm@x.org", at: at(2) });
  await put(C, 1);
  await tf.reject({ reader: d.reader, writer: d.writer, folders: F, image: C, file: (await tf.files(d.reader, "S", C))[0], reason: "blurry", at: at(2) });
  d.lists.length = 0;
  const s = await tf.status(d.reader, F);
  const listed = [...d.lists];
  await put(B, 3);
  const again = await tf.status(d.reader, F);
  const same = await tf.status(d.reader, { submissions: "S", curated: "S", same: true });
  const pick = (st, x) => st.get(tf.subfolderName(x.name, x.sha256)) ?? null;
  out.pending = { a: pick(s, A), b: pick(s, B), c: pick(s, C), bAgain: pick(again, B), sameA: pick(same, A), missing: pick(s, im("z", "9")), listed };
}

// needing ground truth: a marker in the curated folder named as the image's subfolder, read from curated's listing;
// two images of one name marked apart
{
  const d = memoryDrive(), F = { submissions: "S", curated: "C", same: false };
  const A = { name: "a.jpg", sha256: "1".repeat(64) }, B = { name: "b.jpg", sha256: "2".repeat(64) };
  const D1 = { name: "dup.jpg", sha256: "3".repeat(64) }, D2 = { name: "dup.jpg", sha256: "4".repeat(64) };
  for (const x of [A, B, D1]) await tf.markNeeded({ writer: d.writer, curated: "C", image: x });
  d.add({ parent: "C", name: tf.subfolderName(B.name, B.sha256), folder: true });
  d.lists.length = 0;
  const s = await tf.status(d.reader, F), listed = [...d.lists];
  const pick = (x) => s.get(tf.subfolderName(x.name, x.sha256)) ?? null;
  const id = (x) => d.files.find((f) => f.name === tf.neededName(x.name, x.sha256))?.id ?? null;
  out.needed = { name: tf.neededName(A.name, A.sha256), writes: d.writes, parents: [...new Set(d.files.filter((f) => !f.folder).map((f) => f.parent))],
    a: pick(A), aId: id(A), b: pick(B), bId: id(B), d1: pick(D1), d1Id: id(D1), d2: pick(D2), listed };
}

// accepting copies into curated under the same name, recording where from; rejecting marks the submission
{
  const d = memoryDrive();
  await tf.submit({ reader: d.reader, writer: d.writer, folder: "S", image: IMG, email: "jane@lab.org", doc: doc("jane@lab.org", "2026-11-05T10:00:00Z") });
  const sub = (await tf.files(d.reader, "S", IMG))[0];
  await tf.accept({ reader: d.reader, writer: d.writer, folders: { submissions: "S", curated: "C", same: false }, image: IMG, file: sub, by: "dm@lab.org" });
  const cur = await tf.current(d.reader, "C", IMG);
  await tf.reject({ reader: d.reader, writer: d.writer, folders: { submissions: "S", curated: "C", same: false }, image: IMG, file: sub, reason: "test run" });
  const after = (await tf.files(d.reader, "S", IMG))[0];
  out.curate = { name: cur?.name, accepted: cur?.doc.accepted && { by: cur.doc.accepted.by, from: cur.doc.accepted.from_sha256.length }, rejected: after.rejected, reason: after.reason };
}

console.log(JSON.stringify(out));
