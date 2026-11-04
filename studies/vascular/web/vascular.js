// The vascular study's page: the stack in the shell's 3D viewer; Processing runs an extraction algorithm in the page's
// Python and opens the vessel model it draws over the stack or beside it, to correct (model_view.js); while the study
// makes ground truth its tasks are in the left bar (tasks.js), and outside it the model's junctions and vessels are
// cards (items.js). The corrected model is sent as ground truth.
import * as MV from "./model_view.js";
import * as items from "./items.js";
import * as tasks from "./tasks.js";

export function mount(shell) {
  const { $ } = shell, V = shell.viewer.three, truth = shell.makesTruth;
  let algorithms = [], ran = null, running = null;
  MV.init(V, shell.signal, truth);
  shell.signal.addEventListener("abort", () => MV.leave());
  shell.views.on((v) => { items.visibleNow(v === "items"); if (v === "image") V.redraw(); });
  items.init(V, () => shell.views.show("image"), shell.views.count);
  // outside a ground-truth stage there are no tasks, and a missed vessel is drawn from the Review box
  if (truth) tasks.init(V, steps);
  else $("#review-box .col").append($("#m-draw"), $("#draw-note"));

  // ---------- Processing: the algorithm, how it works and how well, Execute ----------
  // each algorithm's precision and recall against the provisional labels, as the lab's grader measured them
  const quality = fetch(new URL("algorithm_metrics.json", import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((q) => (shell.signal.aborted ? new Promise(() => {}) : q));
  const two = (x) => x.toFixed(2).replace(/^0/, "");
  const pr = (r) => `P\u00a0${two(r.precision)}\u00a0·\u00a0R\u00a0${two(r.recall)}`; // one unbroken pair
  const chosen = () => algorithms.find((a) => a.key === $("#vm-algo").value);
  function about() {
    const a = chosen(); if (!a) return;
    $("#vm-about summary").textContent = `How the ${a.title} algorithm works`;
    const note = $("#vm-about-note");
    note.replaceChildren(shell.outline(a.about));
    quality.then((q) => {
      const own = q && q.versions[a.key];
      if (!own || chosen() !== a) return;
      const p = document.createElement("p"), b = document.createElement("strong");
      b.textContent = `${a.title[0].toUpperCase() + a.title.slice(1)} algorithm shows precision of ${own.precision.toFixed(2)} and recall of ${own.recall.toFixed(2)} on ${q.curves} curves a model judged`;
      p.append(b, ` (${q.judge})`); note.append(p);
    });
  }
  const canRun = () => { $("#vm-run").disabled = !algorithms.length || !shell.page.get("image") || !!running; };
  $("#vm-algo").onchange = () => { about(); steps(); };
  $("#vm-run").onclick = () => {
    const a = chosen(), im = shell.page.get("image"); if (!a || !im) return;
    running = a.key; canRun();
    shell.busy(true, `Drawing the vessel model with ${a.title}…`, "scan");
    shell.call("extract", { algorithm: a.key, source: shell.state.fileName, z_step: V.S.zsFrom ? V.S.zs : null });
  };

  // ---------- the status bar's steps, and the Processing box's title ----------
  function steps() {
    const m = MV.current(), a = algorithms.find((x) => x.key === ran);
    shell.step("find", !!m && (!ran || ran === $("#vm-algo").value), m ? (a ? `${a.title}: ${m.segments.length} segments` : "A model file loaded") : "");
    shell.boxDone($("#model-set"), m ? (a ? `${a.title} executed` : "Model loaded") : null);
    const open = truth && tasks.open(), left = (open || []).filter((t) => !t.ok).map((t) => t.text + ".");
    shell.step("review", !!m && (!truth || (!!open && !left.length)), left.join(" ") || "Every task is done.");
  }
  MV.onChange((m) => { if (truth) $("#vm-truth").disabled = !m; if (!m) ran = null; steps(); });

  if (truth) $("#vm-truth").onclick = () => {
    const gt = MV.truth();
    if (!gt) return;
    shell.submitTruth({ doc: gt.doc, count: gt.edits, file: gt.file, items: truth ? tasks.open() : gt.items,
      issue: { title: `Ground truth: ${gt.stem}`, body: `The corrected vessel model of ${gt.stem}, with ${gt.edits} correction${gt.edits === 1 ? "" : "s"}.` },
      empty: "Correct the model first: approve or decline a vessel, check a junction or an area, or draw a missed vessel." });
  };
  // a stack already open when the study comes in (a switch from another study)
  if (shell.page.get("image")) MV.stackOpened();
  window.vascular = { tasks: tasks.inspect, model: MV.inspect };

  return {
    ready(info) {
      algorithms = info.algorithms || [];
      const sel = $("#vm-algo");
      sel.replaceChildren(...algorithms.map((a) => new Option(`${a.icon} ${a.title}`.trim(), a.key)));
      sel.disabled = !algorithms.length;
      quality.then((q) => {
        if (q) sel.title = "Precision (P) and recall (R) of each algorithm against a model's verdicts, not the owner's";
        for (const o of sel.options) if (q && q.versions[o.value]) o.textContent += ` (${pr(q.versions[o.value])})`;
      });
      about(); canRun();
    },
    opening() { ran = null; MV.stackOpened(); canRun(); },
    opened() { canRun(); shell.status("Stack loaded. Press Execute to draw its vessel model."); },
    result(action, meta) {
      if (action !== "extract") return;
      shell.busy(false);
      ran = running; running = null;
      MV.drawn(JSON.stringify(meta), `${meta.algorithm} model`);
      canRun(); steps();
      shell.status(`The vessel model is drawn: ${meta.edges.length} vessels, in ${meta.score?.seconds ?? "?"} s.`);
    },
    error() { if (running) { running = null; shell.busy(false); canRun(); } },
    async settled() { if (running) await shell.until("result:extract"); },
  };
}
