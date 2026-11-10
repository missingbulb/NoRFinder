// The vascular study's page: the stack in the shell's 3D viewer; Processing runs an extraction algorithm in the page's
// Python and opens the vessel model it draws over the stack or beside it, to correct (model_view.js); while the study
// makes ground truth its tasks are in the left bar (tasks.js), and outside it the model's junctions and vessels are
// cards (items.js). The corrected model is sent as ground truth.
import * as MV from "./model_view.js";
import * as items from "./items.js";
import * as tasks from "./tasks.js";
import { order } from "./channel_order.js";

export function mount(shell) {
  const { $ } = shell, V = shell.viewer.three, truth = shell.makesTruth;
  let algorithms = [], ran = null, running = null;
  MV.init(V, shell.signal, truth);
  shell.signal.addEventListener("abort", () => MV.leave());
  shell.views.on((v) => { items.visibleNow(v === "items"); if (v === "image") V.redraw(); });
  items.init(V, () => shell.views.show("image"), shell.views.count);
  if (truth) tasks.init(V, shell.tasks, steps, submit);

  // ---------- Processing: the algorithm, how it works and how well, Execute ----------
  // each algorithm's precision and recall against the provisional labels, as the lab's grader measured them
  const quality = fetch(new URL("algorithm_metrics.json", import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((q) => (shell.signal.aborted ? new Promise(() => {}) : q));
  // the lab's versions on offer, as the build lists them, so the list never waits for the study's Python
  const offered = fetch(new URL("algorithms.GENERATED.json", import.meta.url)).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((list) => (shell.signal.aborted ? new Promise(() => {}) : list), (e) => { shell.status(`The algorithms could not be listed: ${e.message || e}`, true); return []; });
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
    shell.busy(true, `Drawing the vessel model with ${a.title}…`);
    shell.call("extract", { algorithm: a.key, source: shell.state.fileName, z_step: V.S.zsFrom ? V.S.zs : null });
  };

  // ---------- the status bar's steps, and the Processing box's title ----------
  function steps() {
    const m = MV.current(), a = algorithms.find((x) => x.key === ran);
    shell.step("find", !!m && (!ran || ran === $("#vm-algo").value), m ? (a ? `${a.title}: ${m.segments.length} segments` : `${m.segments.length} segments`) : "");
    shell.boxDone($("#model-set"), m ? (a ? `${a.title} executed` : "Model loaded") : null);
    const open = truth && tasks.open(), left = (open || []).filter((t) => !t.ok).map((t) => t.text + ".");
    shell.step("review", !!m && (!truth || (!!open && !left.length)), left.join(" ") || "Every task is done.");
  }
  MV.onChange((m) => { if (truth) shell.tasks.ready(!!m); if (!m) ran = null; steps(); });

  // the tagger's progress on the stack: the model's edits, kept on this device (req/shell/ground-truth/clear)
  shell.clearable("edits to the vessel model", () => MV.forget());
  function submit() {
    const gt = MV.truth();
    if (!gt) return;
    shell.submitTruth({ doc: gt.doc, count: gt.edits, file: gt.file, items: truth ? tasks.open() : gt.items,
      empty: "Correct the model first: approve or decline a vessel, judge a junction, do an area or draw a missed vessel." });
  }
  // a stack already open when the study comes in (a switch from another study)
  if (shell.page.get("image")) MV.stackOpened();
  // edit: an edit of the model from a page test, fn(model) the next model
  window.vascular = { tasks: tasks.inspect, model: MV.inspect, edit: (fn) => MV.edit(fn(MV.current())) };

  offered.then((list) => {
    algorithms = list;
    const sel = $("#vm-algo");
    sel.replaceChildren(...algorithms.map((a) => new Option(`${a.icon} ${a.title}`.trim(), a.key)));
    sel.disabled = !algorithms.length;
    quality.then((q) => {
      if (q) sel.title = "Precision (P) and recall (R) of each algorithm against a model's verdicts, not the owner's";
      for (const o of sel.options) if (q && q.versions[o.value]) o.textContent += ` (${pr(q.versions[o.value])})`;
    });
    about(); canRun();
  });

  return {
    order,
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
    // a curated ground truth's final results (req/shell/ground-truth/view): the corrected model drawn as a model is,
    // with none of the tasks' marks
    showTruth(doc) {
      MV.drawn(JSON.stringify(doc), "curated ground truth");
      const m = MV.current();
      steps();
      return m ? `${m.segments.length} vessel segments` : "a vessel model that could not be read";
    },
    error() { if (running) { running = null; shell.busy(false); canRun(); } },
    async settled() { if (running) await shell.until("result:extract"); },
  };
}
