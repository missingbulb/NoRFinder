// The Ground Truth Tagger's side of the study's ground-truth folders (truth_folders.js): the line in the study's
// ground-truth box (every `.gt-access` its panels hold) saying whether the tagger may write to the submissions folder
// and how to get there (req/shell/ground-truth/tagger-access), its Clear progress (req/shell/ground-truth/clear), and
// Submit (req/shell/ground-truth/submit).
"use strict";
import { folders, submit, status, current, subfolderName } from "./truth_folders.js";

const SAY = {
  unset: "This study has not set up its ground-truth folders yet, so ground truth cannot be submitted.",
  none: "Not approved: this site may not write to the study's submissions folder for you yet.",
  view: "View only: the store lets you only view the study's submissions folder. Ask its owner for edit access.",
  write: "Writable: Submit sends your ground truth to the study's submissions folder.",
  unknown: "Your sign-in ran out. Sign in again to submit.",
};
export const LOCAL_GT = (remote) => `Ground truth cannot be sent from local files, only from ${remote.label}.`;

// account: the sign-in; remote: the remote store; place: the study's place in it (study_root.js studyPlace); image() the image open, {name, sha256, source} or null; on() whether the user makes ground truth now;
// cleared() opens the image afresh once the study has forgotten its progress on it
export function truthTagger({ account, remote, place, image, on, cleared }) {
  const sd = remote.writer(account);
  const reader = place.reader;
  const writer = { folder: sd.folder, create: sd.create, replace: sd.replace, mark: sd.mark };
  // the study's clear: {what, fn}; the access last read: "write" | "view" | "none" | "unset" | "unknown"; epoch: the
  // draw a late answer belongs to
  let clear = null, access = null, epoch = 0;
  // the study's ground-truth folders, from its root's settings
  const gt = async () => folders(await place.settings().catch(() => null));
  const where = async () => (await gt()).submissions;

  async function read() {
    const id = await where();
    if (!id) return "unset";
    try { return (await sd.access(id)) ?? "unknown"; } catch { return "unknown"; }
  }
  function paint() {
    const im = image();
    for (const el of document.querySelectorAll("#left .gt-access")) {
      el.hidden = !on();
      if (el.hidden) continue;
      const approve = access === "none" ? `<button type="button" class="gt-approve" data-needs-network>Approve…</button>` : "";
      const wipe = clear && im ? `<button type="button" class="gt-clear link" title="Forget your ${clear.what} on this image, on this device">Clear progress</button>` : "";
      el.dataset.access = access || "";
      el.innerHTML = `<span class="gt-say"></span>${approve}${wipe}`;
      el.querySelector(".gt-say").textContent = access ? SAY[access] : "Checking whether you may submit…";
      el.querySelector(".gt-approve")?.addEventListener("click", async () => {
        if (await sd.approve([{ id: await where(), name: "Ground truth submissions" }])) draw();
      });
      el.querySelector(".gt-clear")?.addEventListener("click", () => {
        const name = image()?.name;
        if (!clear || !name || !confirm(`Clear your ${clear.what} on ${name}? This forgets your progress on this image on this device; anything you submitted stays in ${remote.label}.`)) return;
        clear.fn(); cleared();
      });
    }
  }
  // the line drawn again, its access read afresh
  async function draw() {
    const mine = ++epoch;
    access = null; paint();
    if (!on()) return;
    const got = await read();
    if (mine === epoch) { access = got; paint(); }
  }

  return {
    draw, paint,
    // the study's progress on an image, which fn forgets on this device, the image then opened afresh: what names it
    clearable(what, fn) { clear = { what, fn }; paint(); },
    leave() { clear = null; access = null; epoch++; },
    // Map(subfolder name -> {curated, pending, rejected}) of the study's images (req/shell/ground-truth/pending);
    // with submissions, the pending ones too, else the curated alone. Empty while the study has no folders.
    async status(submissions) {
      const f = await gt();
      if (!f.curated) return new Map();
      return status(reader, submissions ? f : { submissions: f.curated, curated: f.curated, same: true });
    },
    // whether the image has curated ground truth, from the curated folder's listing alone (req/shell/ground-truth/view)
    async hasCurated(img) {
      const f = await gt();
      return !!f.curated && (await reader.all(f.curated)).some((x) => x.folder && x.name === subfolderName(img.name, img.sha256));
    },
    // the image's curated ground truth, {name, doc}, or null, its files read now (req/shell/ground-truth/view)
    async curated(img) { const f = await gt(); return f.curated ? current(reader, f.curated, img) : null; },
    // why Submit is off for the image open, "" when it is on
    blocked() {
      const im = image();
      if (!im || !remote.owns(im.source)) return LOCAL_GT(remote);
      if (access !== "write") return SAY[access || "unknown"];
      return "";
    },
    // the study's document written to the submissions folder as this tagger's ground truth for the image open
    async submit(doc) {
      const im = image(), email = account.email();
      const full = { ...doc, created: new Date().toISOString(), tagger: email,
        image: { ...(doc.image && typeof doc.image === "object" ? doc.image : {}), name: im.name, sha256: im.sha256, ...remote.cite(im.source) } };
      await submit({ reader, writer, folder: await where(), image: { name: im.name, sha256: im.sha256 }, email, doc: full });
      return full;
    },
  };
}
