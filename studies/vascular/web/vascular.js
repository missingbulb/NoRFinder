// The vascular study's page: the stack in the shell's 3D viewer, its vessel model beside or over it to correct
// (model_view.js), the model's junctions and vessels as cards (items.js), and the corrected model sent as ground truth.
import * as MV from "./model_view.js";
import * as items from "./items.js";

export function mount(shell) {
  const { $ } = shell, V = shell.viewer.three;
  MV.init(V, shell.signal);
  shell.signal.addEventListener("abort", () => MV.leave());
  let view = "image";
  function showView(v) {
    view = v;
    $("#image-view").hidden = v !== "image"; $("#items-view").hidden = v !== "items";
    $("#view").dataset.view = v;
    $("#item-switch").firstChild.textContent = v === "image" ? "Item View " : "Image View ";
    items.visibleNow(v === "items");
    if (v === "image") V.redraw();
  }
  items.init(V, () => showView("image"));
  $("#item-switch").onclick = () => showView(view === "image" ? "items" : "image");
  showView("image");
  MV.onChange((m) => { $("#vm-truth").disabled = !m; });
  $("#vm-truth").onclick = () => {
    const gt = MV.truth();
    if (!gt) return;
    shell.submitTruth({ doc: gt.doc, count: gt.edits, file: gt.file, items: gt.items,
      issue: { title: `Ground truth: ${gt.stem}`, body: `The corrected vessel model of ${gt.stem}, with ${gt.edits} correction${gt.edits === 1 ? "" : "s"}.` },
      empty: "Correct the model first: approve or decline a low-confidence vessel, move a point, or draw a missed vessel." });
  };
  // a stack already open when the study comes in (a switch from another study) brings its draft too
  if (shell.page.get("image")) MV.stackOpened(shell.state.fileName);
  return {
    opened() { MV.stackOpened(shell.state.fileName); },
  };
}
