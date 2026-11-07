// The study's ground-truth tasks in the shell's Ground Truth Tasks box (req/shell/ground-truth/tasks): a bar of one
// part per task, a row per task, and Submit Ground Truth last. The study says what its tasks are and how far each has
// got; how a task is worked through stays the study's, which puts what it needs on the open task's row.
"use strict";

export function truthTasks({ $, icon }) {
  let pick = null, submit = null;
  const rows = () => [...$("#gt-tasks").children].filter((li) => li.dataset.task !== "submit");
  const row = (key) => rows().find((li) => li.dataset.task === key) || null;
  const part = (key) => [...$("#gt-bar").children].find((p) => p.dataset.task === key);
  const ico = $("#gt-submit .gt-ico");
  ico.innerHTML = ["done", "part", "todo"].map((n) => icon(n).replace("<svg ", `<svg class="${n}" `)).join("");

  $("#gt-submit").onclick = () => submit?.();
  $("#gt-tasks").addEventListener("click", (e) => {
    const t = e.target.closest("button.t"), li = t?.closest("li");
    if (li && li.parentElement === $("#gt-tasks")) pick?.(li.dataset.task);
  });

  const api = {
    // tasks: [{key, name, title}] in the order they are done, or null to show none for now; on: {pick(key), submit()}.
    // The same tasks again keep their rows, and what the study put on them.
    list(tasks, on = {}) {
      pick = on.pick || pick; submit = on.submit || submit;
      $("#gt-list").hidden = !tasks;
      if (!tasks || rows().map((li) => li.dataset.task).join() === tasks.map((t) => t.key).join()) return;
      for (const li of rows()) li.remove();
      $("#gt-bar").replaceChildren();
      for (const t of tasks) {
        const li = document.createElement("li");
        li.dataset.task = t.key;
        li.innerHTML = `<div class="task-head"><span class="tick" aria-hidden="true"></span><button class="t" type="button"><span class="n"></span> </button></div><div class="task-body"></div>`;
        const b = li.querySelector(".t");
        b.append(t.name);
        if (t.title) b.title = t.title;
        $("#gt-submit").closest("li").before(li);
        const p = document.createElement("span");
        p.dataset.task = t.key; p.title = t.name;
        $("#gt-bar").append(p);
      }
      api.ready(false);
    },
    // how far a task has got: did of all, done once every one is (or as the study says); did null while not known
    count(key, did, of, done = did != null && of > 0 && did >= of) {
      const li = row(key), p = part(key);
      if (!li) return;
      li.querySelector(".n").textContent = did == null ? "" : `${did}/${of}`;
      li.classList.toggle("done", !!done);
      p.style.flexGrow = did == null ? 1 : Math.max(of, 1); p.style.setProperty("--done", did != null && of ? Math.min(did / of, 1) : 0);
    },
    // the open task, its name in bold: its row, for the study to put its item and tools on; null for none
    open(key) {
      for (const li of rows()) li.classList.toggle("now", li.dataset.task === key);
      return row(key);
    },
    row,
    // whether Submit can be pressed, whether the ground truth is done, partly done or not started where known, and
    // what is left to do as its tooltip
    ready(on, state, title) {
      const b = $("#gt-submit");
      b.disabled = !on;
      if (state) b.dataset.state = state; else delete b.dataset.state;
      if (title) b.title = title; else b.removeAttribute("title");
    },
    // the study leaving: its tasks go
    leave() {
      pick = submit = null;
      for (const li of rows()) li.remove();
      $("#gt-bar").replaceChildren(); $("#gt-list").hidden = true; api.ready(false);
    },
  };
  return api;
}
