// The fixture study's page: a threshold, a Count button, the count, and the counted pixels drawn over
// the image; the count is its ground truth.
export function mount(shell) {
  const $ = shell.$;
  let ready = false, counted = null;
  $("#fx-count").onclick = () => {
    shell.busy(true, "Counting…");
    shell.call("count", { threshold: +$("#fx-threshold").value });
  };
  $("#fx-truth").onclick = () => {
    const name = shell.state.fileName.replace(/\.[^.]*$/, "");
    shell.submitTruth({ doc: { labels: counted ? [counted] : [] }, file: name + "_gt.json", items: [], issue: { title: "Ground truth: " + name, body: "" },
      empty: "Count first." });
  };
  return {
    ready(info) { $("#fx-threshold").value = info.threshold; ready = true; },
    opened() {
      counted = null; $("#fx-count").disabled = !ready; $("#fx-truth").disabled = true;
      $("#fx-result").textContent = "Nothing counted yet."; shell.viewer.layer("fx").replaceChildren();
    },
    result(action, meta, bytes) {
      shell.busy(false);
      counted = { threshold: +$("#fx-threshold").value, count: meta.count };
      $("#fx-result").textContent = `${meta.count} pixels above the threshold`; $("#fx-truth").disabled = false;
      shell.step("count", true, `${meta.count} pixels above ${counted.threshold}`);
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
