// Edit Image (req/shell/data/edit) and its Save… (req/shell/data/edit-save), in Data Management's Preprocessing: the
// image itself opened, and in the Edit Image box what to do with it, each choice redrawing the image as it will be
// saved (edit.js draws it, from the planes the study's Python gave); Save… writes it from the file's own pixels
// (split.js) into the folder named after the image, or downloads it. Done puts the image back as it was opened.
"use strict";
import { whole, layout, derive, suggestSlices, maskOf, maskShare, stemOf } from "./edit.js";
import { readTiff, fromPlanes, evenCuts, gridParts, partName, patternProblem, splitImage, zip } from "./split.js";
import { asLoaded } from "./as_loaded.js";
import { holdOwns } from "./offline.js";

// the user's file-name pattern for a split's parts, kept for the next visit (its name from before Edit Image)
export const SPLIT_PATTERN = "nor-split-pattern";
const PARTS_PATTERN = "_r{row}c{col}", ONE_PATTERN = "_edited";
// a cut stays this share of the crop from the next one
const NEAREST = 1 / 20;
// how close, in screen pixels, a press must land to a cut line to drag it
const GRAB = 7;

// ctx: $, page, still, status, notice, readJSON, writeJSON, saveFile, boxDone, relabel; viewer() the viewer on show;
// original() the file opened, {name, bytes}; loadOriginal(source) to open the image itself in place of its preview;
// accessOf(folder) and saveEdits(folder, image, files, say), Data Management's
export function imageEditor(ctx) {
  const { $, page } = ctx;
  const root = document.documentElement, box = $("#edit-box");
  // the box as the page loaded, put back when an edit ends
  const asStarted = asLoaded([box], holdOwns);
  const svgEl = (tag, attrs) => { const n = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  // base: the image as opened, put back by Done; e: the edit; polygons: the imperfections, in the image's pixels;
  // tool: "crop" or "lasso" while one is armed; signal: each slice's, for the slider's band
  let base = null, e = null, polygons = [], tool = null, n = 1, suggested = null, frame = 0, drag = null;
  const editing = () => !!base;
  // a stack shown in 3D: its lasso draws on the stack from straight above, over it; shown flat, as any flat image
  const three = () => ctx.viewer().three, stack = () => (base?.Z || 1) > 1 && !!three() && !three().stage.hidden;
  let over3d = null;
  const C = () => Math.floor(base.planes.length / (base.W * base.H * (base.Z > 1 ? 1 + base.Z : 1)));

  // ---------- the image as it will be saved ----------
  // in crop's drawing, the whole image with nothing else cut, so the rectangle can be drawn anywhere on it
  const shownEdit = () => (tool === "crop" ? { ...e, crop: whole(base.W, base.H, 1, 1).crop, xs: [0, base.W], ys: [0, base.H], left: new Set() } : e);
  function render() {
    frame = 0;
    if (!editing()) return;
    const d = derive(base, shownEdit());
    page.set({ image: { ...base, W: d.W, H: d.H, Z: d.Z, planes: d.planes, edited: true } });
    overlay();
    summary();
  }
  const later = () => { frame = frame || requestAnimationFrame(render); };

  // the cuts, the parts left out, the crop's rectangle and the imperfections, over the image
  function overlay(live) {
    if (stack()) return overlay3d(live);
    const g = ctx.viewer().layer("edit"), L = layout(shownEdit(), base.W, base.H);
    g.replaceChildren();
    const s = shownEdit();
    if (tool !== "crop") {
      for (const p of gridParts(s.xs, s.ys, s.left)) if (p.left) {
        const [x, y] = L.toView(p.x, p.y), t = svgEl("text", { class: "edit-left", x: x + p.w / 2, y: y + p.h / 2 });
        t.textContent = "left out"; g.append(t);
      }
      const cut = (vertical, i) => {
        const at = vertical ? L.toView(s.xs[i], 0)[0] - L.gap / 2 : L.toView(0, s.ys[i])[1] - L.gap / 2;
        const pos = vertical ? { x1: at, x2: at, y1: 0, y2: L.H } : { x1: 0, x2: L.W, y1: at, y2: at };
        const line = svgEl("line", { class: "edit-cut " + (vertical ? "v" : "h"), ...pos });
        line.dataset.cut = (vertical ? "x" : "y") + i;
        g.append(line);
      };
      for (let i = 1; i < s.xs.length - 1; i++) cut(true, i);
      for (let i = 1; i < s.ys.length - 1; i++) cut(false, i);
    }
    for (const poly of polygons) g.append(svgEl("polygon", { class: "edit-flaw", points: poly.map(([x, y]) => L.toView(x, y).join(",")).join(" ") }));
    if (tool === "crop") {
      const c = live?.crop || e.crop;
      g.append(svgEl("rect", { class: "edit-crop", x: c.x0, y: c.y0, width: c.x1 - c.x0, height: c.y1 - c.y0 }));
    }
    if (live?.lasso) g.append(svgEl("polyline", { class: "edit-lasso", points: live.lasso.map((p) => p.join(",")).join(" ") }));
    if (live?.line) g.append(svgEl("line", { class: "edit-cut dragging", ...live.line }));
  }

  // on a stack, the imperfections and the lasso over the 3D view, following it as it zooms and pans
  let live3d = null;
  function overlay3d(live = live3d) {
    live3d = live;
    if (!over3d) {
      over3d = svgEl("svg", { id: "edit-3d" });
      three().stage.append(over3d);
      three().onDraw(() => { if (editing() && stack()) overlay3d(); });
    }
    const L = layout(e, base.W, base.H), at = (p) => three().toScreen(...p);
    const shape = (tag, cls, pts) => { const q = pts.map(at); if (q.every(Boolean)) over3d.append(svgEl(tag, { class: cls, points: q.map((v) => v.join(",")).join(" ") })); };
    over3d.replaceChildren();
    for (const poly of polygons) shape("polygon", "edit-flaw", poly.map(([x, y]) => L.toView(x, y)));
    if (live?.lasso) shape("polyline", "edit-lasso", live.lasso);
  }

  // ---------- the box ----------
  function controls() {
    for (const b of $("#edit-split").children) b.setAttribute("aria-pressed", String(+b.dataset.n === n));
    $("#edit-split-hint").hidden = n === 1 || (base.Z || 1) > 1;
    $("#edit-crop").setAttribute("aria-pressed", String(tool === "crop"));
    $("#edit-lasso").setAttribute("aria-pressed", String(tool === "lasso"));
    const c = e.crop, cropped = c.x0 || c.y0 || c.x1 !== base.W || c.y1 !== base.H;
    $("#edit-crop-size").textContent = `${c.x1 - c.x0} × ${c.y1 - c.y0} px${cropped ? "" : ", the whole image"}`;
    $("#edit-crop-reset").hidden = !cropped;
    const Z = base.Z || 1;
    $("#edit-slices-sec").hidden = Z < 2;
    // crop and the cut lines draw on a flat image; a stack is shown in 3D, where the lasso draws from straight above
    $("#edit-crop-row").hidden = Z > 1;
    if (Z > 1) {
      for (const [id, v] of [["#edit-z0", e.z[0]], ["#edit-z1", e.z[1]]]) Object.assign($(id), { min: 1, max: Z, value: v + 1 });
      $("#edit-z-text").textContent = `${e.z[0] + 1}–${e.z[1] + 1} of ${Z}`;
      const band = $("#edit-band"), [a, b] = suggested.suggested;
      band.style.left = `${(a / Math.max(1, Z - 1)) * 100}%`; band.style.width = `${((b - a) / Math.max(1, Z - 1)) * 100}%`;
      band.title = `Suggested: slices ${a + 1}–${b + 1}, the ones holding signal`;
      $("#edit-suggest").disabled = e.z[0] === a && e.z[1] === b;
    }
    const names = ctx.viewer().channelList();
    $("#edit-channels").replaceChildren(...Array.from({ length: C() }, (_, k) => {
      const l = document.createElement("label"), i = Object.assign(document.createElement("input"), { type: "checkbox", value: k, checked: e.channels.has(k) });
      l.style.setProperty("--ch", names[k]?.colour || "#888");
      l.append(i, Object.assign(document.createElement("span"), { className: "sw" }), names[k]?.name || `Channel ${k + 1}`);
      return l;
    }));
    $("#edit-flaws").replaceChildren(...polygons.map((poly, k) => {
      const li = document.createElement("li"), share = maskShare(maskOf([poly], base.W, base.H), e.crop, base.W);
      li.textContent = `Imperfection ${k + 1}, ${pct(share)} of the image `;
      const x = Object.assign(document.createElement("button"), { type: "button", className: "link", textContent: "remove" });
      x.onclick = () => { polygons.splice(k, 1); e.mask = maskOf(polygons, base.W, base.H); controls(); later(); };
      li.append(x);
      return li;
    }));
  }
  const pct = (x) => (x > 0 && x < 0.01 ? "<1%" : Math.round(x * 100) + "%");
  // the box's folded title: what the imperfections leave out
  function summary() {
    const share = maskShare(e.mask, e.crop, base.W);
    ctx.boxDone(box, share > 0 ? `${pct(share)} imperfections` : null);
  }
  function setGrid(k) {
    n = k; e.xs = evenCuts(e.crop.x1 - e.crop.x0, n).map((v) => v + e.crop.x0); e.ys = evenCuts(e.crop.y1 - e.crop.y0, n).map((v) => v + e.crop.y0); e.left = new Set();
    controls(); later();
  }
  const arm = (t) => {
    tool = tool === t ? null : t;
    root.toggleAttribute("data-edit-tool", !!tool);
    // a stack's lasso draws on it from straight above, the view held still while it is armed
    if (stack()) { const S = three().S; if (tool === "lasso") S.rot = three().facing(0, 0); S.held = tool === "lasso"; three().redraw(); }
    controls(); later();
  };
  $("#edit-split").addEventListener("click", (ev) => { const k = +ev.target.dataset?.n; if (k) setGrid(k); });
  $("#edit-crop").onclick = () => arm("crop");
  $("#edit-crop-reset").onclick = () => { e.crop = whole(base.W, base.H, 1, 1).crop; setGrid(n); };
  $("#edit-lasso").onclick = () => arm("lasso");
  const slid = (which) => {
    let [a, b] = [+$("#edit-z0").value - 1, +$("#edit-z1").value - 1];
    if (a > b) { if (which === 0) a = b; else b = a; }
    e.z = [a, b]; controls(); later();
  };
  $("#edit-z0").oninput = () => slid(0);
  $("#edit-z1").oninput = () => slid(1);
  $("#edit-suggest").onclick = () => { e.z = [...suggested.suggested]; controls(); later(); };
  $("#edit-channels").addEventListener("change", (ev) => {
    const k = +ev.target.value;
    if (ev.target.checked) e.channels.add(k); else e.channels.delete(k);
    later();
  });

  // ---------- the pointer on the image: the crop's rectangle, the lasso, a cut dragged, a part clicked ----------
  const sc = () => (stack() ? three().stage : ctx.viewer().scroller);
  const viewAt = (ev) => (stack() ? three().toImage(ev) : ctx.viewer().toImage(ev));
  function down(ev) {
    if (!editing() || ev.button !== 0 || !ev.target.closest(stack() ? "#v3-stage" : "#stage")) return;
    if (stack() && tool !== "lasso") return;
    const at = viewAt(ev), zoom = ctx.state.zoom, L = layout(shownEdit(), base.W, base.H);
    if (!at) return;
    if (tool === "crop") drag = { kind: "crop", from: at };
    else if (tool === "lasso") drag = { kind: "lasso", points: [at] };
    else {
      const near = (v, w) => Math.abs(v - w) * zoom <= GRAB;
      const xi = e.xs.findIndex((x, i) => i > 0 && i < e.xs.length - 1 && near(at[0], L.toView(x, 0)[0] - L.gap / 2));
      const yi = e.ys.findIndex((y, i) => i > 0 && i < e.ys.length - 1 && near(at[1], L.toView(0, y)[1] - L.gap / 2));
      if (xi > 0) drag = { kind: "cut", axis: "x", i: xi };
      else if (yi > 0) drag = { kind: "cut", axis: "y", i: yi };
      else if (n > 1) drag = { kind: "part", from: at, part: L.partAt(...at) };
      else return;
    }
    ev.preventDefault(); ev.stopImmediatePropagation();
    sc().setPointerCapture(ev.pointerId);
  }
  // a cut's place in the image for a point of the drawing, kept a twentieth of the crop from its neighbours
  function cutAt(axis, i, at) {
    const cuts = axis === "x" ? e.xs : e.ys, size = cuts[cuts.length - 1] - cuts[0], room = Math.ceil(size * NEAREST);
    // the line is drawn in the middle of its gap: the part after it starts half a gap further on
    const L = layout(e, base.W, base.H), h = L.gap / 2, v = L.toImage(at[0] + (axis === "x" ? h : 0), at[1] + (axis === "y" ? h : 0))[axis === "x" ? 0 : 1];
    return Math.round(Math.max(cuts[i - 1] + room, Math.min(cuts[i + 1] - room, v)));
  }
  function move(ev) {
    if (!drag) return;
    ev.stopImmediatePropagation();
    const at = viewAt(ev), clamp = (v, hi) => Math.max(0, Math.min(hi, Math.round(v)));
    if (drag.kind === "crop") {
      const [x, y] = [clamp(at[0], base.W), clamp(at[1], base.H)], [fx, fy] = [clamp(drag.from[0], base.W), clamp(drag.from[1], base.H)];
      drag.crop = { x0: Math.min(x, fx), y0: Math.min(y, fy), x1: Math.max(x, fx), y1: Math.max(y, fy) };
      overlay({ crop: drag.crop });
    } else if (drag.kind === "lasso") { if (at) drag.points.push(at); overlay({ lasso: drag.points }); }
    else if (drag.kind === "cut") {
      drag.to = cutAt(drag.axis, drag.i, at);
      const L = layout(e, base.W, base.H), p = drag.axis === "x" ? L.toView(drag.to, 0)[0] - L.gap / 2 : L.toView(0, drag.to)[1] - L.gap / 2;
      overlay({ line: drag.axis === "x" ? { x1: p, x2: p, y1: 0, y2: L.H } : { x1: 0, x2: L.W, y1: p, y2: p } });
    }
  }
  function up(ev) {
    if (!drag) return;
    ev.stopImmediatePropagation();
    const d = drag; drag = null;
    if (d.kind === "crop" && d.crop && d.crop.x1 - d.crop.x0 >= 8 && d.crop.y1 - d.crop.y0 >= 8) { e.crop = d.crop; tool = null; root.removeAttribute("data-edit-tool"); setGrid(n); }
    else if (d.kind === "lasso" && d.points.length > 2) {
      const L = layout(e, base.W, base.H);
      polygons.push(d.points.map((p) => L.toImage(...p).map((v) => Math.round(v * 10) / 10)));
      e.mask = maskOf(polygons, base.W, base.H); live3d = null; controls(); later();
    } else if (d.kind === "cut" && d.to != null) { (d.axis === "x" ? e.xs : e.ys)[d.i] = d.to; later(); }
    else if (d.kind === "part" && d.part) {
      if (e.left.has(d.part)) e.left.delete(d.part); else e.left.add(d.part);
      later();
    } else overlay();
  }
  // before the viewer's own panning, so a tool's press is not a drag of the view
  addEventListener("pointerdown", down, true);
  addEventListener("pointermove", move, true);
  addEventListener("pointerup", up, true);
  addEventListener("pointercancel", () => { drag = null; if (editing()) overlay(); }, true);

  // ---------- opening and leaving ----------
  // the image itself in place of its preview: resolves once it is open
  function original(im) {
    if (im.source?.kind !== "preview") return Promise.resolve(im);
    return new Promise((ok) => {
      const ctl = new AbortController();
      page.watch("image", (next) => { if (next && ctx.remote.owns(next.source) && next.source.id === im.source.id) { ctl.abort(); ok(next); } }, { signal: ctl.signal });
      ctx.loadOriginal(im.source);
    });
  }
  async function open() {
    const im = page.get("image");
    if (!im || editing()) return;
    const got = await original(im);
    base = got; n = 1; polygons = []; tool = null;
    e = whole(base.W, base.H, base.Z || 1, C());
    suggested = suggestSlices(base);
    root.dataset.editing = "";
    box.hidden = false; box.classList.remove("folded"); ctx.relabel();
    controls(); render();
  }
  function done() {
    if (!editing()) return;
    const was = base;
    if (stack()) three().S.held = false;
    base = null; tool = null; drag = null; live3d = null;
    delete root.dataset.editing; root.removeAttribute("data-edit-tool");
    ctx.viewer().layer("edit").replaceChildren(); over3d?.replaceChildren();
    asStarted(); box.hidden = true; ctx.boxDone(box, null); ctx.relabel();
    page.set({ image: was });
  }
  $("#edit-open").onclick = () => open();
  $("#edit-done").onclick = done;
  page.watch("image", (im) => {
    $("#edit-open").disabled = !im || editing();
    // another image opened, or none: the edit is over
    if (editing() && (!im || (!im.edited && im !== base))) { base = null; done(); }
  });

  // ---------- Save… ----------
  const dlg = $("#save-dlg");
  const parts = () => gridParts(e.xs, e.ys, e.left).filter((p) => !p.left);
  const pattern = () => $("#save-pattern").value;
  function names() {
    const rows = e.ys.length - 1, cols = e.xs.length - 1, list = parts().map((p) => partName(pattern(), base.source?.name || ctx.original().name, p, rows, cols));
    $("#save-names").replaceChildren(...list.map((t) => Object.assign(document.createElement("li"), { textContent: t })));
    const why = !e.channels.size ? "Keep at least one channel." : !list.length ? "Every part is left out." : patternProblem(pattern(), list);
    $("#save-msg").textContent = why || ""; $("#save-msg").classList.toggle("err", !!why);
    $("#save-download").disabled = !!why;
    const access = base.source?.folder ? ctx.accessOf(base.source.folder) : null;
    $("#save-remote").disabled = !!why || access !== "write";
    $("#save-remote").title = access === "write" ? "" : base.source?.folder ? "This folder is not writable for you here: see its access in the tree." : `Only an image from the study's ${ctx.remote.short} folders can be saved there.`;
    return why;
  }
  $("#edit-save").onclick = () => {
    if (!editing()) return;
    const kept = ctx.readJSON(SPLIT_PATTERN, "");
    $("#save-pattern").value = n > 1 ? kept || PARTS_PATTERN : ONE_PATTERN;
    const image = base.source?.name || ctx.original().name;
    $("#save-where").textContent = base.source?.folder
      ? `Into the folder ${stemOf(image)}, beside ${image}, in ${ctx.remote.label}: the page makes it the first time.`
      : `This image is not from the study's ${ctx.remote.short} folders: it can be downloaded.`;
    names(); dlg.showModal();
  };
  $("#save-pattern").addEventListener("input", () => { if (n > 1) ctx.writeJSON(SPLIT_PATTERN, pattern()); names(); });
  $("#save-close").onclick = () => dlg.close();
  // the files, from the file's own pixels
  async function files() {
    const f = ctx.original(), data = new Uint8Array(f.bytes);
    let src;
    if (/\.tiff?$/i.test(f.name)) src = readTiff(data);
    else {
      const bmp = await createImageBitmap(new Blob([data])), c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d");
      g.drawImage(bmp, 0, 0);
      const px = g.getImageData(0, 0, bmp.width, bmp.height).data, N = bmp.width * bmp.height;
      src = fromPlanes(bmp.width, bmp.height, Array.from({ length: C() }, (_, k) => { const p = new Uint8Array(N); for (let i = 0; i < N; i++) p[i] = px[i * 4 + Math.min(k, 2)]; return p; }));
    }
    const look = ctx.viewer().channelList();
    return splitImage(src, { xs: e.xs, ys: e.ys, parts: gridParts(e.xs, e.ys, e.left), channels: [...e.channels].sort((a, b) => a - b), slices: src.Z > 1 ? e.z : null,
      look, pattern: pattern(), source: { name: f.name, sha256: ctx.state.sha, ...(base.source?.id && ctx.remote.cite(base.source)) }, removed: polygons, mask: e.mask });
  }
  const busy = (b, act) => async () => {
    if (names()) return;
    b.disabled = true;
    try { await act(); } catch (err) { $("#save-msg").textContent = err.message || String(err); $("#save-msg").classList.add("err"); } finally { b.disabled = false; }
  };
  $("#save-download").onclick = busy($("#save-download"), async () => {
    const out = await files();
    if (out.length === 1) ctx.saveFile(out[0].name, out[0].bytes, "image/tiff");
    else ctx.saveFile(stemOf(ctx.original().name) + "_parts.zip", zip(out), "application/zip");
    $("#save-msg").textContent = `Downloaded ${out.length === 1 ? out[0].name : out.length + " files"}.`;
  });
  $("#save-remote").onclick = busy($("#save-remote"), async () => {
    const out = await files(), say = (t) => { $("#save-msg").textContent = t; };
    const into = stemOf(base.source.name);
    await ctx.saveEdits(base.source.folder, base.source.name, out, say);
    dlg.close(); done();
    ctx.status(`Saved ${out.length === 1 ? out[0].name : out.length + " files"} into the folder ${into}, which now stands in the image's place.`);
  });

  return { open, done, get editing() { return editing(); } };
}
