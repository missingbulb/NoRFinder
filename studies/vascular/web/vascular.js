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

  // ---------- Processing: Execute, with the algorithm chosen above it (the shell's) ----------
  const chosen = () => algorithms.find((a) => a.key === shell.algorithm.key);
  const canRun = () => { $("#vm-run").disabled = !algorithms.length || !shell.page.get("image") || !!running; };
  shell.algorithm.on(() => steps());
  $("#vm-run").onclick = () => {
    const a = chosen(), im = shell.page.get("image"); if (!a || !im) return;
    running = a.key; canRun();
    shell.busy(true, `Drawing the vessel model with ${a.title}…`);
    shell.call("extract", { algorithm: a.key, source: shell.state.fileName, z_step: V.S.zsFrom ? V.S.zs : null });
  };

  // ---------- the status bar's steps, and the Processing box's title ----------
  function steps() {
    const m = MV.current(), a = algorithms.find((x) => x.key === ran);
    shell.step("find", !!m && (!ran || ran === shell.algorithm.key), m ? (a ? `${a.title}: ${m.segments.length} segments` : `${m.segments.length} segments`) : "");
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

  shell.algorithm.ready.then((list) => { algorithms = list; canRun(); });

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
