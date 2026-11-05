// The Ground Truth Tagger's side of the study's ground-truth folders (truth_folders.js): the line in the study's
// ground-truth box (every `.gt-access` its panels hold) saying whether the tagger may write to the submissions folder
// and how to get there (req/shell/ground-truth/tagger-access), its Clear progress (req/shell/ground-truth/clear), and
// Submit (req/shell/ground-truth/submit).
"use strict";
import { studyDrive } from "./study_drive.js";
import { folders, submit } from "./truth_folders.js";

const SAY = {
  unset: "This study has not set up its ground-truth folders yet, so ground truth cannot be submitted.",
  none: "Not approved: this site may not write to the study's submissions folder for you yet.",
  view: "View only: Drive lets you only view the study's submissions folder. Ask its owner for edit access.",
  write: "Writable: Submit sends your ground truth to the study's submissions folder.",
  unknown: "Your Google sign-in ran out. Sign in again to submit.",
};
export const LOCAL_GT = "Ground truth cannot be sent from local files, only from Google Drive.";

// account: the sign-in; drive: the public Drive reader (drive.js); google: the site's Google settings; manifest() the
// study on show; image() the image open, {name, sha256, source} or null; on() whether the user makes ground truth now;
// cleared() opens the image afresh once the study has forgotten its progress on it
export function truthTagger({ account, drive, google, manifest, image, on, cleared }) {
  const sd = studyDrive({ account, apiKey: google.apiKey || "", clientId: google.clientId || "" });
  const reader = { all: (id) => drive.all(id), text: async (id) => new TextDecoder().decode((await drive.file(id, "ground truth")).bytes) };
  const writer = { folder: sd.folder, create: sd.create, replace: sd.replace, mark: sd.mark };
  // the study's clear: {what, fn}; the access last read: "write" | "view" | "none" | "unset" | "unknown"; epoch: the
  // draw a late answer belongs to
  let clear = null, access = null, epoch = 0;
  const where = () => folders(manifest()).submissions;

  async function read() {
    const id = where();
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
        if (await sd.approve([{ id: where(), name: "Ground truth submissions" }])) draw();
      });
      el.querySelector(".gt-clear")?.addEventListener("click", () => {
        const name = image()?.name;
        if (!clear || !name || !confirm(`Clear your ${clear.what} on ${name}? This forgets your progress on this image on this device; anything you submitted stays in Google Drive.`)) return;
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
    // why Submit is off for the image open, "" when it is on
    blocked() {
      const im = image();
      if (!im || im.source?.kind !== "drive") return LOCAL_GT;
      if (access !== "write") return SAY[access || "unknown"];
      return "";
    },
    // the study's document written to the submissions folder as this tagger's ground truth for the image open
    async submit(doc) {
      const im = image(), email = account.email();
      const full = { ...doc, created: new Date().toISOString(), tagger: email,
        image: { ...(doc.image && typeof doc.image === "object" ? doc.image : {}), name: im.name, sha256: im.sha256, drive_id: im.source.id } };
      await submit({ reader, writer, folder: where(), image: { name: im.name, sha256: im.sha256 }, email, doc: full });
      return full;
    },
  };
}
