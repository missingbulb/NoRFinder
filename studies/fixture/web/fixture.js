// The fixture study's page: a threshold, a Count button, the count, and the counted pixels drawn over
// the image; the count is its ground truth, and checking it is right its one task.
export function mount(shell) {
  const $ = shell.$;
  let ready = false, counted = null;
  $("#fx-count").onclick = () => {
    shell.busy(true, "Counting…");
    shell.call("count", { threshold: +$("#fx-threshold").value });
  };
  const submit = () => {
    const name = shell.state.fileName.replace(/\.[^.]*$/, "");
    shell.submitTruth({ doc: { labels: counted ? [counted] : [] }, count: counted ? 1 : 0, file: name + "_gt.json", items: [],
      empty: "Count first." });
  };
  // its one task, checking the count, open once there is one and the tagger tags
  const task = () => {
    const done = $("#fx-done").checked;
    shell.tasks.count("check", done ? 1 : 0, 1);
    shell.tasks.ready(!!counted, counted ? (done ? "done" : "todo") : undefined);
    $("#fx-check").hidden = !counted;
    shell.tasks.open(counted && !done ? "check" : null)?.querySelector(".task-body").append($("#fx-check"));
  };
  const pick = (key) => { if (counted) shell.tasks.open(key).querySelector(".task-body").append($("#fx-check")); };
  shell.tasks.list([{ key: "check", name: "Count checked", title: "Whether the count is right" }], { submit, pick, tagging: task });
  $("#fx-done").onchange = task;
  // its progress on the image, the count, is kept nowhere but the page
  shell.clearable("count", () => {});
  return {
    // the curated ground truth's final result: the count, and no task
    showTruth(doc) {
      const c = doc.labels?.[0];
      $("#fx-result").textContent = c ? `Ground truth: ${c.count} pixels above ${c.threshold}` : "Ground truth: nothing counted";
      return c ? `${c.count} pixels counted` : "nothing counted";
    },
    ready(info) { $("#fx-threshold").value = info.threshold; ready = true; },
    opened() {
      counted = null; $("#fx-count").disabled = !ready; $("#fx-done").checked = false; task(); shell.views.count(null);
      $("#fx-result").textContent = $("#fx-sum").textContent = $("#fx-item").textContent = "Nothing counted yet."; shell.viewer.layer("fx").replaceChildren();
    },
    result(action, meta, bytes) {
      shell.busy(false);
      counted = { threshold: +$("#fx-threshold").value, count: meta.count };
      $("#fx-result").textContent = $("#fx-sum").textContent = $("#fx-item").textContent = `${meta.count} pixels above the threshold`;
      $("#fx-done").checked = false; task(); shell.views.count(1);
      shell.step("count", true, `${meta.count} pixels above ${counted.threshold}`);
      shell.boxDone($("#fx-box"), `Counted at ${counted.threshold}`);
      const { W } = shell.state, g = shell.viewer.layer("fx");
      let d = "";
      for (let i = 0; i < bytes.length; i++) if (bytes[i]) d += `M${i % W} ${Math.floor(i / W)}h1v1h-1z`;
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d); p.setAttribute("fill", "rgba(255, 0, 200, 0.4)"); p.id = "fx-mask";
      g.replaceChildren(p);
      shell.status("Counted.");
    },
  };
}
