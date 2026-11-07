// Data Management (req/shell/data/mode, req/shell/data/drive-access, req/shell/data/folder,
// req/shell/data/update-previews, req/shell/data/preview-images, req/shell/ground-truth/setup): the Study Manager role's
// view, for a signed-in user the store lets write to the study's root: its data folder as a tree in a column left of the left bar, its chevron folding
// it; a folder chosen fills the main area with its images and the left bar with their sums, and its actions; an image
// chosen opens from its preview. The tree's head asks for the folders' access, and it writes only
// files it creates.
"use strict";
import { PREVIEWS } from "./previews.js";
import { makePreview, buildPreviews } from "./previews_writer.js";
import { readTiff, fromPlanes, writeTiff } from "./split.js";
import { CONNECTION } from "./offline.js";
import { replacedBy, stemOf } from "./edit.js";
import * as tf from "./truth_folders.js";
import { setup as setUp, switchMode } from "./study_root.js";

const IMAGE = /\.(tiff?|png)$/i;
const MAX_FOLDERS = 200;
// what each access means beside a folder
const ACCESS = {
  write: ["Writable", "This site may add files here for you."],
  view: ["View only", "The store lets you only view this folder: ask its owner for edit access."],
  none: ["Not approved", "Not yet open to this site: approve it to add files here."],
  unknown: ["Checking…", "Your sign-in is being renewed."],
};
export const truthMarker = (name) => stemOf(name) + ".ground_truth.MISSING";

// a preview as an ImageJ TIFF a study's Python opens: a flat image's three colour planes, a stack's slices
export function previewTiff(e, pages) {
  const { W, H } = pages[0];
  if (e.kind !== "stack") {
    const rgb = pages[0].data, planes = [0, 1, 2].map((j) => Uint8Array.from({ length: W * H }, (_, i) => rgb[i * 3 + j]));
    return writeTiff({ w: W, h: H, bps: 1, planes, description: "ImageJ=1.11a\nimages=3\nchannels=3\nmode=composite\n" }).buffer;
  }
  const [Z, C] = e.volume, spacing = e.spacing ? (e.spacing * e.slices) / Z : null;
  return writeTiff({ w: W, h: H, bps: 1, planes: pages.map((p) => p.data),
    description: `ImageJ=1.11a\nimages=${Z * C}\nchannels=${C}\nslices=${Z}\nhyperstack=true\nmode=composite\n${spacing ? `spacing=${spacing}\nunit=micron\n` : ""}` }).buffer;
}

// ctx: what the shell lends it, named below where it is used
export function dataMode(ctx) {
  const { $, esc, remote, account, place, sizeText } = ctx;
  const sd = remote.writer(account);
  // the study's ground-truth folders (req/shell/ground-truth/folders), read with no sign-in and written by the user
  const reader = place.reader;
  const writer = { folder: sd.folder, create: sd.create, replace: sd.replace, mark: sd.mark, share: sd.share };
  // gt: {submissions, curated, same}; gtNodes: those folders with their access, outside the tree
  let gt = { submissions: null, curated: null, same: false }, gtNodes = [];
  const root = document.documentElement;
  // the study's folders, by id: {id, name, parent, files, folders (ids), access, el}; roots their ids
  let nodes = new Map(), roots = [], manifest = null, who = null, epoch = 0, loaded = null, chosen = null, layout = "grid";
  const on = () => root.dataset.mode === "data";
  // the study's ground-truth folders are not its data: the tree leaves them out
  const isTruth = (id) => id === gt.curated || id === gt.submissions;
  const offline = () => root.classList.contains("offline");
  const msg = (el, text, err) => { el.textContent = text; el.classList.toggle("err", !!err); };

  // ---------- the folders and their access ----------
  // every folder under the study's own, listed with every file in it; once per study
  function load() {
    if (loaded) return loaded;
    if (offline()) { msg($("#data-msg"), "You are offline: the study's folders can be read once you are back online."); return Promise.resolve(); }
    msg($("#data-msg"), "");
    const of = epoch;
    return (loaded = (async () => {
      // the root's settings name the data folder and the ground-truth folders
      const s = await place.settings({ fresh: true }).catch((e) => { msg($("#data-msg"), e.message || String(e), true); return null; });
      if (of !== epoch) return;
      const top = place.root();
      roots = top ? [s?.data || top] : [];
      gt = tf.folders(s);
      gtNodes = [...new Set([gt.curated, gt.submissions].filter(Boolean))].map((id) => ({ id, name: "Ground truth", access: null }));
      drawSetup(s); drawTruthBox(null); truthStatus();
      const queue = roots.map((id) => ({ id, parent: null, name: null }));
      while (queue.length && nodes.size < MAX_FOLDERS) {
        const at = queue.shift();
        if (nodes.has(at.id)) continue;
        let all;
        try { all = await remote.all(at.id); } catch (e) { if (of !== epoch) return; all = []; at.error = e.message || String(e); }
        if (of !== epoch) return;
        const node = { id: at.id, name: at.name || "Study folder", parent: at.parent, error: at.error || null, files: all.filter((f) => !f.folder),
          folders: all.filter((f) => f.folder && !isTruth(f.id)).map((f) => f.id), access: null, el: null };
        nodes.set(at.id, node);
        for (const f of all) if (f.folder && !isTruth(f.id)) queue.push({ id: f.id, parent: at.id, name: f.name });
      }
      // a study folder's own name, which its listing does not give
      await Promise.all(roots.map(async (id) => {
        try { const n = nodes.get(id), r = await remote.name(id); if (n && r) n.name = r; } catch { /* keeps "Study folder" */ }
      }));
      await checkAccess();
    })());
  }
  async function checkAccess() {
    await Promise.all([...nodes.values(), ...gtNodes].map(async (n) => {
      try { n.access = (await sd.access(n.id)) || "unknown"; } catch (e) { console.warn("access not read:", e); n.access = "unknown"; }
    }));
    drawTree();
  }
  const lacking = () => [...nodes.values(), ...gtNodes].filter((n) => n.access === "none");

  async function approve() {
    const want = lacking();
    if (!want.length) return;
    try {
      if (!(await sd.approve(want.map((n) => ({ id: n.id, name: n.name }))))) return msg($("#data-msg"), "No permission was given: nothing changed.", true);
      for (const n of want) n.access = null;
      drawTree(); await checkAccess();
    } catch (e) { msg($("#data-msg"), e.message || String(e), true); }
  }
  $("#data-approve").onclick = approve;

  // ---------- Set up ground truth (req/shell/ground-truth/setup) ----------
  // offered while the study's root names no ground-truth folders, and nudged while it has none at all
  const gtStudy = () => !!manifest && (manifest.stage === "GT" || manifest.stage === "PostGT");
  function drawSetup(s) {
    const b = $("#gt-setup");
    b.hidden = !gtStudy() || !place.root() || !!s?.set;
    b.classList.toggle("nudge", !gt.curated);
    b.title = gt.curated ? "Name the study's ground-truth folders in its root's settings" : "Make the study's ground-truth folders in its root";
  }
  $("#gt-setup").onclick = () => { msg($("#setup-msg"), ""); $("#setup-dlg").showModal(); };
  $("#setup-cancel").onclick = () => $("#setup-dlg").close();
  for (const b of document.querySelectorAll("#setup-dlg [data-review]")) b.onclick = async () => {
    const review = b.dataset.review === "yes", say = (text, err) => msg($("#setup-msg"), text, err);
    const top = place.root();
    for (const x of document.querySelectorAll("#setup-dlg button")) x.disabled = true;
    try {
      if ((await sd.access(top)) !== "write") {
        say("Approve the study's root for this site…");
        if (!(await sd.approve([{ id: top, name: "Study root" }])) || (await sd.access(top)) !== "write") throw new Error("This site may not write to the study's root for you.");
      }
      say("Making the ground-truth folders…");
      await setUp({ reader, writer, root: top, review, by: account.email() });
      $("#setup-dlg").close();
      msg($("#data-msg"), review ? "Ground truth set up: GT submissions, reviewed into GT curated." : "Ground truth set up: one GT folder.");
      nodes = new Map(); loaded = null; chosen = null; await load();
    } catch (e) { say(e.message || String(e), true); }
    for (const x of document.querySelectorAll("#setup-dlg button")) x.disabled = false;
  };

  // ---------- the Ground Truth box: how the study takes it, and how many images have it ----------
  function drawTruthBox(gts) {
    const box = $("#gt-box");
    box.hidden = !gt.curated || !gtStudy();
    if (box.hidden) return;
    $("#gt-mode").textContent = gt.same ? "One folder: whatever a tagger submits counts at once."
      : "Reviewed: taggers submit to GT submissions, and a study manager accepts each into GT curated.";
    const sw = $("#gt-switch");
    sw.textContent = gt.same ? "Switch to reviewed…" : "Switch to unreviewed…";
    if (!gts) { $("#gt-counts").textContent = "Reading…"; sw.disabled = true; return; }
    const all = [...gts.values()], n = (p) => all.filter(p).length, images = (k) => `${k} image${k === 1 ? "" : "s"}`;
    const has = n((g) => g.curated), pending = n((g) => g.pending), rejected = n((g) => g.rejected);
    // going unreviewed waits for every pending submission to be accepted or rejected
    sw.disabled = !gt.same && pending > 0;
    sw.title = sw.disabled ? `${pending} submission${pending === 1 ? " is" : "s are"} pending review: accept or reject ${pending === 1 ? "it" : "them"} first`
      : gt.same ? "Have a study manager review each submission into GT curated" : "Let whatever a tagger submits count at once";
    $("#gt-counts").textContent = [has ? `${images(has)} ${has === 1 ? "has" : "have"} ground truth.` : "No image has ground truth yet.",
      pending ? `${images(pending)} pending review.` : "", rejected ? `${images(rejected)} rejected.` : ""].filter(Boolean).join(" ");
  }

  // ---------- switching between reviewed and unreviewed (req/shell/ground-truth/switch) ----------
  $("#gt-switch").onclick = () => {
    const review = gt.same;
    $("#switch-title").textContent = review ? "Switch to reviewed ground truth" : "Switch to unreviewed ground truth";
    $("#switch-text").textContent = review
      ? "No file is moved, copied or deleted. The GT folder becomes GT curated: everything submitted so far counts as accepted. A new GT submissions folder is made for taggers to submit to. In Google Drive, give taggers edit access to GT submissions and take their edit access off GT curated."
      : "No file is moved, copied or deleted. GT curated becomes the one folder: everything accepted stays the study's ground truth, and whatever a tagger submits counts at once. GT submissions, its rejected files included, stays as it is and is no longer used. In Google Drive, give taggers edit access to GT curated.";
    $("#switch-go").dataset.review = review ? "yes" : "no";
    msg($("#switch-msg"), ""); $("#switch-dlg").showModal();
  };
  $("#switch-cancel").onclick = () => $("#switch-dlg").close();
  $("#switch-go").onclick = async () => {
    const review = $("#switch-go").dataset.review === "yes", top = place.root(), btns = document.querySelectorAll("#switch-dlg button");
    for (const x of btns) x.disabled = true;
    try {
      msg($("#switch-msg"), "Switching…");
      await switchMode({ reader, writer, root: top, review, by: account.email() });
      $("#switch-dlg").close();
      msg($("#data-msg"), review ? "Switched to reviewed ground truth." : "Switched to unreviewed ground truth.");
      nodes = new Map(); loaded = null; chosen = null; await load();
    } catch (e) { msg($("#switch-msg"), e.message || String(e), true); }
    for (const x of btns) x.disabled = false;
  };

  // ---------- the tree ----------
  // a folder's images, but those an edit replaced (req/shell/data/edit-save)
  const imagesOf = (n) => {
    const edited = replacedBy([...n.files, ...n.folders.map((id) => ({ name: nodes.get(id)?.name, folder: true }))]);
    return n.files.filter((f) => IMAGE.test(f.name) && f.name !== PREVIEWS && !edited(f));
  };
  function drawTree() {
    if (!on()) return;
    const make = (id) => {
      const n = nodes.get(id);
      if (!n) return document.createDocumentFragment();
      const el = n.el ||= Object.assign(document.createElement("div"), { className: "tree-folder" });
      el.dataset.id = id; el.setAttribute("role", "treeitem"); el.setAttribute("aria-expanded", "true");
      const ims = imagesOf(n), a = ACCESS[n.access || "unknown"];
      if (!el.firstChild) {
        el.innerHTML = `<div class="row"><button type="button" class="name"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.75 2.5h4l1.5 1.5h7a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-.75.75h-12.5a.75.75 0 0 1-.75-.75v-10a.75.75 0 0 1 .75-.75Z"/></svg><span></span></button><span class="access"></span><button type="button" class="count" aria-expanded="false"></button></div><div class="tree-images" role="group" hidden></div><div class="tree-children" role="group"></div>`;
        el.querySelector(".name").onclick = () => chooseFolder(n);
        el.querySelector(".count").onclick = (e) => { e.stopPropagation(); toggleImages(n); };
      }
      el.querySelector(".name span").textContent = n.name;
      const acc = el.querySelector(".access");
      acc.dataset.access = n.access || "unknown"; acc.textContent = a[0]; acc.title = n.error ? "The store did not list it: " + n.error : a[1];
      const count = el.querySelector(".count");
      count.textContent = ims.length === 1 ? "1 image" : `${ims.length} images`; count.disabled = !ims.length;
      el.classList.toggle("chosen", chosen?.kind === "folder" && chosen.id === id);
      el.querySelector(".tree-children").replaceChildren(...n.folders.map(make));
      return el;
    };
    $("#data-tree").replaceChildren(...roots.map(make));
    const allowed = lacking().length;
    $("#data-approve").hidden = !allowed; $("#data-approve").textContent = `Approve ${allowed === 1 ? "1 folder" : allowed + " folders"}…`;
  }
  // a folder's images, each with a small preview, folded under it until its count is clicked
  async function toggleImages(n) {
    const box = n.el.querySelector(".tree-images"), b = n.el.querySelector(".count");
    box.hidden = !box.hidden; b.setAttribute("aria-expanded", String(!box.hidden));
    if (box.hidden || box.childElementCount) return;
    const pv = await previewsOf(n);
    box.replaceChildren(...imagesOf(n).map((f) => {
      const row = document.createElement("button");
      row.type = "button"; row.className = "tree-image"; row.dataset.id = f.id; row.setAttribute("role", "treeitem");
      row.innerHTML = `<span class="pic"></span><span class="name">${esc(f.name)}</span>`;
      row.onclick = () => chooseImage(n, f);
      picture(row.querySelector(".pic"), pv, f);
      return row;
    }));
  }

  // ---------- a folder's previews and sums ----------
  const previewsFile = (n) => n.files.find((f) => f.name === PREVIEWS);
  const previewsOf = async (n) => { const f = previewsFile(n); return f ? ctx.folderPreviews(n, f) : null; };
  async function picture(pic, pv, f) {
    const e = pv?.entry(f.name, f.sha);
    let src = null;
    if (e) try { src = await pv.picture(e); } catch (err) { console.warn(`${f.name}'s preview could not be read:`, err); }
    if (!src) { pic.classList.add("none"); return; }
    const i = new Image(); i.alt = ""; i.src = src; pic.replaceChildren(i);
  }
  // each image's state in the folder: {f, entry, stale, truth, pending, rejected, marker}, its ground truth as gts
  // (truth_folders.js status) has it
  function states(n, pv, gts) {
    return imagesOf(n).map((f) => {
      const entry = pv?.entry(f.name, f.sha) || null, g = (f.sha && gts.get(tf.subfolderName(f.name, f.sha))) || {};
      return { f, entry, stale: !entry && !!pv?.index.images.some((e) => e.name === f.name),
        truth: !!g.curated, pending: !!g.pending, rejected: !!g.rejected, marker: n.files.find((x) => x.name === truthMarker(f.name)) || null };
    });
  }
  // the ground truth of every image either folder holds, an empty Map while the study names none
  async function truthStatus() {
    if (!gt.curated) return new Map();
    try { const gts = await tf.status(reader, gt); drawTruthBox(gts); return gts; } catch (e) {
      msg($("#folder-msg"), "The ground-truth folders could not be read: " + (e.message || e), true);
      $("#gt-counts").textContent = "The ground-truth folders could not be read."; return new Map();
    }
  }

  async function chooseFolder(n) {
    chosen = { kind: "folder", id: n.id }; root.dataset.sel = "folder"; ctx.relabel();
    drawTree(); ctx.showFolder(true);
    $("#folder-name").textContent = n.name; $("#folder-title").textContent = n.name;
    msg($("#folder-msg"), "");
    const of = epoch;
    // read again: the folder may have changed in the store since
    try { n.files = (await remote.all(n.id)).filter((f) => !f.folder); } catch (e) { msg($("#folder-msg"), e.message || String(e), true); }
    if (of !== epoch || chosen?.id !== n.id) return;
    if (n.el) n.el.querySelector(".tree-images").replaceChildren();
    drawTree();
    const [pv, gts] = await Promise.all([previewsOf(n), truthStatus()]);
    if (of !== epoch || chosen?.id !== n.id) return;
    const all = states(n, pv, gts), count = (p) => all.filter(p).length;
    const rows = [["images", "Images", all.length], ["previews", "With a preview", count((s) => s.entry)], ["stale", "Preview out of date", count((s) => s.stale)],
      ["truth", "With ground truth", count((s) => s.truth)], ["pending", "Ground truth pending", count((s) => s.pending)], ["missing", "Marked as needing it", count((s) => s.marker)]];
    if (gt.same) msg($("#folder-msg"), "This study's submissions are its curated ground truth: whatever a tagger submits is used at once.");
    $("#folder-summary").replaceChildren(...rows.flatMap(([k, label, v]) => {
      const dt = Object.assign(document.createElement("dt"), { textContent: label }), dd = Object.assign(document.createElement("dd"), { textContent: String(v) });
      dd.dataset.k = k; return [dt, dd];
    }));
    const todo = count((s) => !s.entry);
    $("#update-previews").disabled = !todo || n.access !== "write";
    $("#update-previews").title = !todo ? "Every image has an up-to-date preview" : n.access !== "write" ? ACCESS[n.access || "unknown"][1] : `Make the ${todo} missing or out-of-date previews`;
    drawItems(n, all, pv);
  }

  // the folder's images in the main area, a grid of previews or a list
  function drawItems(n, all, pv) {
    $("#folder-items").dataset.layout = layout;
    $("#folder-items").replaceChildren(...all.map((s, k) => {
      const cell = document.createElement("div");
      cell.className = "cell"; cell.dataset.id = s.f.id; cell.tabIndex = 0;
      if (k < 60) cell.style.viewTransitionName = "cell-" + k;
      const tag = s.entry ? "" : s.stale ? "Preview out of date" : "No preview";
      cell.innerHTML = `<span class="pic"></span><span class="name">${esc(s.f.name)}</span><span class="meta">${esc(s.f.size == null ? "" : sizeText(s.f.size))}</span>` +
        `<span class="tags">${tag ? `<span class="tag warn">${tag}</span>` : ""}${s.truth ? '<span class="tag yes">Ground truth</span>' : ""}` +
        `${s.pending ? '<span class="tag pending">GT pending</span>' : ""}${s.rejected ? '<span class="tag warn">GT rejected</span>' : ""}</span>` +
        (s.pending ? `<button type="button" class="review-gt" data-needs-network title="See the taggers' submissions, and accept or reject each">Review GT</button>` : "") +
        `<button type="button" class="mark-gt" data-needs-network aria-pressed="${!!s.marker}" title="Mark it as needing ground truth: a ${esc(truthMarker(s.f.name))} file beside it">Needs GT</button>`;
      cell.onclick = (e) => { if (!e.target.closest(".mark-gt, .review-gt")) chooseImage(n, s.f); };
      cell.querySelector(".review-gt")?.addEventListener("click", () => review(n, s.f));
      cell.onkeydown = (e) => { if (e.key === "Enter" && e.target === cell) chooseImage(n, s.f); };
      const mark = cell.querySelector(".mark-gt");
      mark.disabled = n.access !== "write" || s.truth; mark.onclick = () => markTruth(n, s, mark);
      picture(cell.querySelector(".pic"), pv, s.f);
      return cell;
    }));
  }
  const setLayout = (l) => {
    layout = l;
    for (const b of document.querySelectorAll("#folder-layout button")) b.setAttribute("aria-pressed", String(b.dataset.layout === l));
    const go = () => { $("#folder-items").dataset.layout = l; };
    if (ctx.still() || !document.startViewTransition) return go();
    root.dataset.cells = ""; const t = document.startViewTransition(go);
    t.ready.catch(() => {}); t.finished.finally(() => delete root.dataset.cells);
  };
  for (const b of document.querySelectorAll("#folder-layout button")) b.onclick = () => setLayout(b.dataset.layout);

  // the folder again, after the page wrote into it
  const relist = (n) => chooseFolder(n);

  // ---------- the folder's actions ----------
  async function markTruth(n, s, b) {
    b.disabled = true;
    try {
      if (!s.marker) await sd.create(n.id, truthMarker(s.f.name), new Blob([], { type: "text/plain" }));
      else if (await sd.ours(s.marker.id)) await sd.trash(s.marker.id);
      else throw new Error("Someone else marked it; whoever adds its ground truth drops the marker.");
      await relist(n);
    } catch (e) { msg($("#folder-msg"), e.message || String(e), true); b.disabled = false; }
  }
  // An image's submissions (req/shell/ground-truth/curate): each tagger's newest, with when it was made and how many
  // marks it holds, to accept into the curated folder or reject with a reason
  async function review(n, f) {
    const dlg = $("#curate-dlg"), list = $("#curate-list"), say = (text, err) => msg($("#curate-msg"), text, err);
    const image = { name: f.name, sha256: f.sha };
    $("#curate-title").textContent = f.name; list.replaceChildren(); say("Reading the submissions…");
    dlg.showModal();
    const curatedOk = gtNodes.find((g) => g.id === gt.curated)?.access === "write";
    try {
      const subs = await tf.files(reader, gt.submissions, image);
      const rows = await Promise.all(subs.map(async (s) => {
        let doc = null;
        try { doc = JSON.parse(await reader.text(s.id)); } catch { /* shown as unreadable */ }
        return { s, doc };
      }));
      list.replaceChildren(...rows.map(({ s, doc }) => {
        const li = document.createElement("li");
        const when = doc?.created ? new Date(doc.created).toLocaleString() : "no time";
        li.innerHTML = `<span class="who"></span><span class="hint"></span><span class="grow"></span>` +
          `<button type="button" class="accept primary" data-needs-network>Accept</button><button type="button" class="reject" data-needs-network>Reject</button>`;
        li.querySelector(".who").textContent = doc?.tagger || s.name;
        li.querySelector(".hint").textContent = s.rejected ? `rejected: ${s.reason || "no reason given"}` : `${when}, ${doc?.labels?.length ?? "?"} marks`;
        const [ok, no] = li.querySelectorAll("button");
        ok.disabled = !doc || !curatedOk; ok.title = curatedOk ? "Copy it into the curated folder, as this image's ground truth" : ACCESS.none[1];
        no.disabled = s.rejected;
        ok.onclick = async () => {
          ok.disabled = no.disabled = true; say("Accepting…");
          try { await tf.accept({ reader, writer, folders: gt, image, file: s, by: account.email() }); say(`Accepted ${doc.tagger || s.name}'s ground truth.`); await relist(n); }
          catch (e) { say(e.message || String(e), true); ok.disabled = no.disabled = false; }
        };
        no.onclick = async () => {
          const reason = prompt("Why is it rejected? The tagger sees this.", "");
          if (reason === null) return;
          ok.disabled = no.disabled = true; say("Rejecting…");
          try { await tf.reject({ reader, writer, folders: gt, image, file: s, reason }); say("Rejected."); await relist(n); }
          catch (e) { say(e.message || String(e), true); no.disabled = false; }
        };
        return li;
      }));
      say(rows.length ? (curatedOk ? "" : "Approve the curated folder in the tree's head to accept.") : "No submissions.");
    } catch (e) { say(e.message || String(e), true); }
  }
  $("#curate-close").onclick = () => $("#curate-dlg").close();

  // the image's planes as a reader gives them
  async function sourceOf(name, bytes) {
    if (!/\.png$/i.test(name)) return readTiff(new Uint8Array(bytes));
    const bmp = await createImageBitmap(new Blob([bytes])), c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d");
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data, n = bmp.width * bmp.height, planes = [0, 1, 2].map(() => new Uint8Array(n));
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) planes[j][i] = d[4 * i + j];
    return fromPlanes(bmp.width, bmp.height, planes);
  }
  $("#update-previews").onclick = () => ctx.working($("#update-previews"), async () => {
    const n = nodes.get(chosen?.id);
    if (!n) return;
    const say = (t, err) => msg($("#folder-msg"), t, err);
    try {
      const f = previewsFile(n);
      if (f && !(await sd.ours(f.id))) return say(`This folder's ${PREVIEWS} was not made by this page, so the page leaves it alone. Delete it in ${remote.label} to let the page make and update it.`, true);
      const pv = f ? await ctx.folderPreviews(n, f) : null, all = states(n, pv, new Map()), kept = [], made = [];
      for (const s of all) if (s.entry) kept.push({ entry: s.entry, pages: await pv.pages(s.entry) });
      const todo = all.filter((s) => !s.entry);
      for (const [k, s] of todo.entries()) {
        say(`Making previews: ${k + 1} of ${todo.length}, ${s.f.name}…`);
        const got = (await ctx.savedImage(s.f.id)) || (await remote.file(s.f.id, s.f.name));
        const src = await sourceOf(s.f.name, got.bytes), spacing = src.ij?.spacing ? +src.ij.spacing : null;
        made.push({ name: s.f.name, sha256: await ctx.sha256(got.bytes), ...(await makePreview(src, spacing)) });
      }
      say(`Saving the previews to ${remote.label}…`);
      const blob = new Blob([await buildPreviews(kept, made)], { type: "image/tiff" });
      if (f) await sd.replace(f.id, blob); else await sd.create(n.id, PREVIEWS, blob);
      await relist(n);
      say(`${made.length} preview${made.length === 1 ? "" : "s"} made, ${kept.length} kept.`);
    } catch (e) {
      if (e.throttled) ctx.throttle();
      say(e.message || String(e), true);
    }
  });

  // ---------- an image: its preview first ----------
  async function chooseImage(n, f) {
    chosen = { kind: "image", id: f.id, folder: n.id }; root.dataset.sel = "image"; ctx.relabel();
    drawTree(); ctx.showFolder(false);
    const pv = await previewsOf(n), e = pv?.entry(f.name, f.sha), source = remote.source(f.id, { name: f.name, folder: n.id });
    if (!e) { ctx.status(`${f.name} has no preview yet: opening the image itself.`); return ctx.loadOriginal(source); }
    let pages;
    try { pages = await pv.pages(e); } catch (err) {
      console.warn(`${f.name}'s preview could not be read:`, err);
      ctx.status(`${f.name}'s preview could not be read: opening the image itself.`); return ctx.loadOriginal(source);
    }
    ctx.openPreview(stemOf(f.name) + ".preview.tif", previewTiff(e, pages), { ...source, kind: "preview" });
  }


  // ---------- entering and leaving ----------
  function enter(open) {
    if (open === on()) return;
    const go = () => {
      if (open) root.dataset.mode = "data"; else { delete root.dataset.mode; delete root.dataset.sel; chosen = null; ctx.showFolder(false); }
      ctx.modeChanged(open);
    };
    poof(open);
    go();
    if (open) { drawTree(); load(); }
  }
  // Load vanishes in a puff on the way in, and comes back on the way out
  function poof(open) {
    const l = $("#load");
    l.classList.remove("poof", "unpoof");
    if (!open) { if (l.classList.contains("gone") && !ctx.still()) { void l.offsetWidth; l.classList.add("unpoof"); } l.classList.remove("gone"); return; }
    if (ctx.still()) return l.classList.add("gone");
    void l.offsetWidth;
    l.classList.add("poof");
    // gone once the puff is over, whether it ran out, was cut short or (WebKit, at times) never started
    Promise.all(l.getAnimations().map((x) => x.finished.catch(() => {}))).then(() => { l.classList.remove("poof"); if (on()) l.classList.add("gone"); });
  }
  // the chevron folds the tree to a strip, and opens it again
  $("#data-open").onclick = () => {
    const fold = root.dataset.tree !== "folded";
    if (fold) root.dataset.tree = "folded"; else delete root.dataset.tree;
    $("#data-open").setAttribute("aria-expanded", String(!fold));
  };
  // the network back: the folders read afresh, if they could not be read before
  addEventListener(CONNECTION, (e) => {
    if (!e.detail.online || !on() || nodes.size) return;
    loaded = null; load();
  });

  return {
    // a study comes in (or the user signs in or out): who may do what in it
    mount(m) {
      // the same study again, for the same person (Unload): the mode and the tree stay as they were
      if (manifest && m.id === manifest.id && account.email() === who) { manifest = m; ctx.showFolder(chosen?.kind === "folder"); return; }
      epoch++; manifest = m; who = account.email(); nodes = new Map(); loaded = null; chosen = null;
      if (on()) enter(false);
      roots = []; gt = tf.folders(null); gtNodes = [];
      $("#gt-setup").hidden = true; $("#gt-box").hidden = true;
      $("#data-tree").replaceChildren(); msg($("#data-msg"), "");
    },
    // whoever is signed in may have changed: the study's roles again, if so
    signedIn() { if (manifest && account.email() !== who) this.mount(manifest); },
    // the Study Manager role chosen, or left (req/shell/account/role)
    role(open) { $("#data-col").hidden = !open; enter(open); },
    get on() { return on(); },
    // the access to the folder an image is in, as the tree knows it ("write", "view", "none", or null when unknown)
    accessOf: (folder) => nodes.get(folder)?.access ?? null,
    // Edit Image's files into the folder named after the image, beside it: the page's own one when it made it
    // before, else a new one; the tree read again after (req/shell/data/edit-save)
    async saveEdits(folder, image, files, say) {
      const n = nodes.get(folder);
      if (!n || n.access !== "write") throw new Error(ACCESS[n?.access || "unknown"][1]);
      const name = stemOf(image), there = (await remote.all(folder)).find((f) => f.folder && f.name === name);
      if (there && !(await sd.ours(there.id))) throw new Error(`This folder already holds a folder named ${name} that this page did not make.`);
      const into = there ? there.id : await sd.folder(folder, name);
      for (const [k, f] of files.entries()) {
        say(`Saving ${k + 1} of ${files.length}, ${f.name}…`);
        await sd.create(into, f.name, new Blob([f.bytes], { type: "image/tiff" }));
      }
      nodes = new Map(); loaded = null; chosen = null;
      await load();
      if (nodes.has(folder)) await chooseFolder(nodes.get(folder));
    },
  };
}
