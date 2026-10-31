// The Split into parts dialog, opened on the image open (shell.splitImage): the image small with the grid's lines
// over it, 2 × 2 or 3 × 3, each line dragged where the user wants it and each part clicked to leave it out; the
// channels and slices the parts keep, and the pattern their file names take. Download all parts gives one ZIP of
// them (split.js writes them); Upload to Google Drive waits for a Google sign-in the page does not have.
import { readTiff, fromPlanes, evenCuts, gridParts, partName, patternProblem, splitImage, zip, DEFAULT_PATTERN } from "./split.js";

// the user's file-name pattern for the parts, kept for the next visit
export const SPLIT_PATTERN = "nor-split-pattern";
// the preview's longest side, in screen pixels
const SIDE = 440;
const NO_DRIVE = "Uploading to Google Drive needs a Google sign-in, and this page opens Drive without one.";

export function splitter(shell) {
  const { $, state: st } = shell;
  const svgEl = (tag, attrs) => { const n = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const dlg = $("#split-dlg"), svg = $("#split-grid"), msg = $("#split-msg");
  // the image as split reads it, and the file it was read from
  let src = null, of = null, look = [];
  // the grid: where it cuts across (xs) and down (ys), and the parts left out, "row,col"
  let n = 2, xs = [], ys = [], left = new Set();
  $("#split-drive").title = NO_DRIVE;

  // the file as the split reads it: a TIFF whole; anything else (a PNG) as the browser decodes it, 8 bits a channel
  async function read({ name, bytes }) {
    const data = new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);
    if (/\.tiff?$/i.test(name) || [0x49, 0x4d].includes(data[0]) && data[0] === data[1]) return readTiff(data);
    const bmp = await createImageBitmap(new Blob([data]));
    const c = new OffscreenCanvas(bmp.width, bmp.height), ctx = c.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data, N = bmp.width * bmp.height;
    const planes = Array.from({ length: look.length === 1 ? 1 : 3 }, (_, k) => { const p = new Uint8Array(N); for (let i = 0; i < N; i++) p[i] = px[i * 4 + k]; return p; });
    return fromPlanes(bmp.width, bmp.height, planes);
  }

  function setGrid(k) {
    n = k; xs = evenCuts(src.W, n); ys = evenCuts(src.H, n); left = new Set();
    for (const b of $("#split-n").children) b.classList.toggle("on", +b.dataset.n === n);
    draw();
  }

  // the parts over the preview: each part a cell to click, numbered as {n} counts them; each cut a line to drag
  function draw() {
    svg.setAttribute("viewBox", `0 0 ${src.W} ${src.H}`);
    const font = Math.min(src.W, src.H) / (n * 5);
    svg.replaceChildren();
    for (const p of gridParts(xs, ys, left)) {
      const cell = svgEl("rect", { class: "cell" + (p.left ? " left" : ""), x: p.x, y: p.y, width: p.w, height: p.h });
      cell.dataset.part = `${p.row},${p.col}`;
      const tag = svgEl("text", { class: "tag", x: p.x + p.w / 2, y: p.y + p.h / 2, "font-size": font });
      tag.textContent = p.left ? "left out" : String(p.n);
      svg.append(cell, tag);
    }
    const line = (vertical, i) => {
      const at = vertical ? xs[i] : ys[i], pos = vertical ? { x1: at, x2: at, y1: 0, y2: src.H } : { y1: at, y2: at, x1: 0, x2: src.W };
      const grip = svgEl("line", { class: "grip " + (vertical ? "v" : "h"), ...pos });
      grip.dataset.cut = (vertical ? "x" : "y") + i;
      svg.append(grip, svgEl("line", { class: "cut", ...pos }));
    };
    for (let i = 1; i < n; i++) { line(true, i); line(false, i); }
    names();
  }

  // a cut dragged stays at least a twentieth of the image from its neighbours
  let drag = null;
  svg.addEventListener("pointerdown", (e) => {
    const cut = e.target.dataset?.cut;
    if (!cut) return;
    drag = { axis: cut[0], i: +cut.slice(1), el: e.target };
    e.target.classList.add("dragging"); svg.setPointerCapture(e.pointerId); e.preventDefault();
  });
  svg.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = svg.getBoundingClientRect(), cuts = drag.axis === "x" ? xs : ys, size = drag.axis === "x" ? src.W : src.H;
    const at = drag.axis === "x" ? ((e.clientX - r.left) / r.width) * size : ((e.clientY - r.top) / r.height) * size, gap = Math.max(1, Math.round(size / 20));
    cuts[drag.i] = Math.round(Math.min(cuts[drag.i + 1] - gap, Math.max(cuts[drag.i - 1] + gap, at)));
    const keep = drag.el.dataset.cut;
    draw();
    drag.el = svg.querySelector(`[data-cut="${keep}"]`); drag.el.classList.add("dragging");
  });
  const drop = () => { drag?.el.classList.remove("dragging"); drag = null; };
  svg.addEventListener("pointerup", drop); svg.addEventListener("pointercancel", drop);
  svg.addEventListener("click", (e) => {
    const part = e.target.dataset?.part;
    if (!part) return;
    left.has(part) ? left.delete(part) : left.add(part);
    draw();
  });
  $("#split-n").addEventListener("click", (e) => { const k = +e.target.dataset?.n; if (k) setGrid(k); });

  // what the download would hold, and why it cannot be had when it cannot
  const keptChannels = () => [...$("#split-channel-list").querySelectorAll("input:checked")].map((i) => +i.value);
  const slices = () => [+$("#split-z0").value - 1, +$("#split-z1").value - 1];
  function problem(list) {
    if (!list.length) return "Every part is left out: click a part to keep it.";
    if (!keptChannels().length) return "Keep at least one channel.";
    const [z0, z1] = slices();
    if (!(z0 >= 0 && z1 < src.Z && z0 <= z1) || !Number.isInteger(z0) || !Number.isInteger(z1)) return `Keep slices between 1 and ${src.Z}, the first no later than the last.`;
    return patternProblem($("#split-pattern").value, list);
  }
  function names() {
    const parts = gridParts(xs, ys, left).filter((p) => !p.left), pattern = $("#split-pattern").value;
    const list = parts.map((p) => partName(pattern, st.fileName, p, n, n));
    const MOST = 5;
    $("#split-names").replaceChildren(...list.slice(0, MOST).map((t) => Object.assign(document.createElement("li"), { textContent: t })),
      ...(list.length > MOST ? [Object.assign(document.createElement("li"), { textContent: `… and ${list.length - MOST} more` })] : []));
    const why = problem(list);
    say(why || `${list.length} part${list.length === 1 ? "" : "s"} to write.`, !!why);
    $("#split-download").disabled = !!why;
  }
  const say = (text, err) => { msg.textContent = text; msg.classList.toggle("err", !!err); };

  function fill() {
    const box = $("#split-channel-list");
    box.replaceChildren(...Array.from({ length: src.C }, (_, k) => {
      const l = document.createElement("label"), i = Object.assign(document.createElement("input"), { type: "checkbox", value: k, checked: true });
      const sw = document.createElement("span"); sw.className = "sw"; sw.style.setProperty("--ch", look[k]?.colour || "#888");
      l.append(i, sw, document.createTextNode(look[k]?.name || src.names[k] || `Channel ${k + 1}`));
      return l;
    }));
    $("#split-slices").hidden = src.Z < 2;
    Object.assign($("#split-z0"), { max: src.Z, value: 1 }); Object.assign($("#split-z1"), { max: src.Z, value: src.Z });
    $("#split-z-of").textContent = `of ${src.Z}`;
    $("#split-frames").hidden = src.T < 2; $("#split-frames").textContent = `Every one of its ${src.T} time points is kept.`;
    const shown = $("#base"), k = SIDE / Math.max(src.W, src.H), c = $("#split-canvas");
    c.width = Math.max(1, Math.round(src.W * k)); c.height = Math.max(1, Math.round(src.H * k));
    c.getContext("2d").drawImage(shown, 0, 0, c.width, c.height);
  }
  for (const id of ["#split-channel-list", "#split-z0", "#split-z1"]) $(id).addEventListener("input", () => names());
  $("#split-pattern").addEventListener("input", () => { shell.writeJSON(SPLIT_PATTERN, $("#split-pattern").value); names(); });

  async function open() {
    if (!st.kept) return;
    look = shell.viewer?.channelList?.() || [];
    if (of !== st.kept) {
      try { src = await read(st.kept); } catch (e) { return shell.notice(`This image cannot be split: ${e.message || e}.`); }
      of = st.kept; setGrid(2);
    }
    $("#split-pattern").value = shell.readJSON(SPLIT_PATTERN, "") || DEFAULT_PATTERN;
    fill(); draw();
    dlg.showModal();
  }

  $("#split-download").onclick = async () => {
    const btn = $("#split-download");
    btn.disabled = true;
    let last = 0;
    try {
      const parts = gridParts(xs, ys, left);
      const source = { name: st.fileName, sha256: st.sha || null, ...(st.source?.kind === "drive" && { drive: st.source.id }) };
      const files = await splitImage(src, {
        xs, ys, parts, channels: keptChannels(), slices: slices(), look, pattern: $("#split-pattern").value, source,
        // the dialog says how far it has got, and the page is drawn now and then while the parts are written
        progress: (done, all) => {
          say(`Writing the parts: plane ${done} of ${all}…`);
          if (performance.now() - last > 100) { last = performance.now(); return new Promise((ok) => setTimeout(ok)); }
        },
      });
      const out = zip(files), name = st.fileName.replace(/\.[^.]+$/, "") + "_parts.zip";
      shell.saveFile(name, out, "application/zip");
      const mb = (out.size / 1048576).toFixed(1);
      say(`Downloaded ${name}: ${files.length} part${files.length === 1 ? "" : "s"}, ${mb} MB.`);
    } catch (e) {
      say(`Could not write the parts: ${e.message || e}.`, true);
    } finally { btn.disabled = false; }
  };
  $("#split-close").onclick = () => dlg.close();
  // an image unloaded or another opened takes the dialog away
  shell.page.watch("image", (im) => { if (!im && dlg.open) dlg.close(); });

  return { open };
}
