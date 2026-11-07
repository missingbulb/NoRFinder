// Runs a study's root (web/study_root.js) under Node against an in-memory store, case by case, and prints each
// case's outcome as one JSON object for test_study_root.py to judge.
//   node web-tests/study_root_driver.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sr = await import(path.join(repo, "web", "study_root.js"));

// an in-memory store: the reader's calls (all, text) and the writer's (folder, create, replace, share), each counted
function memory() {
  let n = 0;
  const files = [], calls = [];
  const add = (f) => { const g = { id: "id" + n++, ...f }; files.push(g); return g; };
  const reader = {
    all: async (parent) => { calls.push(["all", parent]); return files.filter((f) => f.parent === parent).map((f) => ({ id: f.id, name: f.name, folder: !!f.folder })); },
    text: async (id) => { calls.push(["text", id]); return files.find((f) => f.id === id).body; },
  };
  const writer = {
    folder: async (parent, name) => { calls.push(["folder", name]); return add({ parent, name, folder: true }).id; },
    create: async (parent, name, blob) => { calls.push(["create", name]); return { id: add({ parent, name, body: await blob.text() }).id }; },
    replace: async (id, blob) => { calls.push(["replace", files.find((f) => f.id === id).name]); files.find((f) => f.id === id).body = await blob.text(); return { id }; },
    share: async (id) => { calls.push(["share", files.find((f) => f.id === id).name]); },
  };
  return { files, calls, add, reader, writer };
}
const AT = new Date("2026-11-07T10:00:00Z");
const out = {};

// a root with only its data folder: found by name, nothing set up
{
  const m = memory(); m.add({ parent: "ROOT", name: "Data", folder: true });
  const s = await sr.read(m.reader, "ROOT", { fresh: true });
  out.bare = { data: !!s.data, curated: s.curated, submissions: s.submissions, set: s.set, calls: m.calls.length };
}

// set up with review: two folders, curated shared, the settings file naming them; read back from the file
{
  const m = memory(); const data = m.add({ parent: "ROOT", name: "Data", folder: true });
  const s = await sr.setup({ reader: m.reader, writer: m.writer, root: "ROOT", review: true, by: "dm@acme.example", at: AT });
  const file = m.files.find((f) => f.name === sr.SETTINGS);
  const doc = JSON.parse(file.body);
  const again = await sr.read(m.reader, "ROOT", { fresh: true });
  out.review = { writes: m.calls.filter(([k]) => k !== "all" && k !== "text"), doc: { ...doc, curated: !!doc.curated, submissions: !!doc.submissions, data: doc.data === data.id },
    same: s.same, readBack: again.curated === s.curated && again.submissions === s.submissions && again.data === data.id && again.set };
  // run again: nothing made twice, the file rewritten
  const before = m.files.filter((f) => f.folder).length;
  m.calls.length = 0;
  await sr.setup({ reader: m.reader, writer: m.writer, root: "ROOT", review: true, by: "dm@acme.example", at: AT });
  out.rerun = { folders: m.files.filter((f) => f.folder).length - before, writes: m.calls.filter(([k]) => k !== "all" && k !== "text") };
}

// set up without review: one GT folder for both
{
  const m = memory(); m.add({ parent: "ROOT", name: "Data", folder: true });
  const s = await sr.setup({ reader: m.reader, writer: m.writer, root: "ROOT", review: false, by: "dm@acme.example", at: AT });
  out.free = { writes: m.calls.filter(([k]) => k !== "all" && k !== "text"), same: s.same, one: s.curated === s.submissions };
}

// folders made by hand, no settings file: found by name
{
  const m = memory(); m.add({ parent: "ROOT", name: "data", folder: true });
  const c = m.add({ parent: "ROOT", name: "GT Curated", folder: true }), su = m.add({ parent: "ROOT", name: "GT submissions", folder: true });
  const s = await sr.read(m.reader, "ROOT", { fresh: true });
  out.byName = { curated: s.curated === c.id, submissions: s.submissions === su.id, same: s.same, set: s.set };
}

// a settings file naming a folder by id wins over the names, so a renamed folder still counts
{
  const m = memory(); m.add({ parent: "ROOT", name: "Data", folder: true });
  const renamed = m.add({ parent: "ROOT", name: "Old GT", folder: true });
  m.add({ parent: "ROOT", name: "GT", folder: true });
  m.add({ parent: "ROOT", name: sr.SETTINGS, body: JSON.stringify({ format: sr.FORMAT, data: null, curated: renamed.id, submissions: renamed.id, review: false }) });
  const s = await sr.read(m.reader, "ROOT", { fresh: true });
  out.byFile = { curated: s.curated === renamed.id, same: s.same };
}

// read twice within the minute: one listing; fresh reads again
{
  const m = memory(); m.add({ parent: "R2", name: "Data", folder: true });
  await sr.read(m.reader, "R2"); await sr.read(m.reader, "R2");
  const cached = m.calls.length;
  await sr.read(m.reader, "R2", { fresh: true });
  out.cache = { cached, fresh: m.calls.length - cached };
}

console.log(JSON.stringify(out));
