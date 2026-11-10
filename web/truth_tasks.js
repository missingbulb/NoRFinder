// The study's ground-truth tasks in the shell's Ground Truth Tasks box (req/shell/ground-truth/tasks): a bar of one
// part per task, a row per task, and Submit Ground Truth last. The study says what its tasks are and how far each has
// got; how a task is worked through stays the study's, which puts what it needs on the open task's row. A task is open
// only while the tagger tags, from Start GT tagging to Stop tagging (req/shell/ground-truth/tagging).
"use strict";

// started(): whether the study's first step is done; until it is, Submit stays off whatever the study says; heardBy(on):
// the shell's own listener, told as the study is each time tagging starts or stops; draftKey(): where the image open's
// draft is kept on this device, null while none is open; readJSON and writeJSON, the shell's storage
export function truthTasks({ $, icon, started, heardBy, draftKey, readJSON, writeJSON }) {
  let pick = null, submit = null, heard = null, resume = null, wants = false, on = false;
  const rows = () => [...$("#gt-tasks").children].filter((li) => li.dataset.task !== "submit");
  const row = (key) => rows().find((li) => li.dataset.task === key) || null;
  const part = (key) => [...$("#gt-bar").children].find((p) => p.dataset.task === key);
  const ico = $("#gt-submit .gt-ico");
  ico.innerHTML = ["done", "part", "todo"].map((n) => icon(n).replace("<svg ", `<svg class="${n}" `)).join("");

  $("#gt-submit").onclick = () => submit?.();
  $("#gt-start").onclick = () => api.tagging(!on);
  // the tagger's progress on the image open, as the study last gave it: what Continue tagging hands back
  const draft = () => { const k = draftKey(); return k ? readJSON(k, null) : null; };
  $("#gt-continue").onclick = () => {
    const d = draft();
    if (!d || !resume) return api.offer();
    resume(d);
    if (!on) api.tagging(true);
  };
  $("#gt-tasks").addEventListener("click", (e) => {
    const t = e.target.closest("button.t"), li = t?.closest("li");
    if (!li || li.parentElement !== $("#gt-tasks")) return;
    if (!on) api.tagging(true);
    pick?.(li.dataset.task);
  });
  function tagged(now) {
    $("#gt-start").textContent = now ? "Stop tagging" : "Start GT tagging";
    $("#gt-start").title = now ? "Back to viewing the image" : "Work through the tasks, one item at a time";
    $("#gt-start").classList.toggle("primary", !now);
    if (!now) for (const li of rows()) li.classList.remove("now");
  }

  const api = {
    // tasks: [{key, name, title}] in the order they are done, or null to show none for now; hooks: {pick(key), submit(),
    // tagging(on)}, tagging heard each time tagging starts or stops. The same tasks again keep their rows, and what the
    // study put on them.
    list(tasks, hooks = {}) {
      pick = hooks.pick || pick; submit = hooks.submit || submit; heard = hooks.tagging || heard; resume = hooks.resume || resume;
      api.offer();
      if (!tasks) api.tagging(false);
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
    // how far a task has got: did of all, done once every one is (or as the study says); did null while not known,
    // of null for a task with no total, which shows its count alone and is done when the study says; shown, when given,
    // what the row says in the count's place, "" for nothing, the bar's part still did of all
    count(key, did, of, done = did != null && of > 0 && did >= of, shown) {
      const li = row(key), p = part(key);
      if (!li) return;
      li.querySelector(".n").textContent = shown ?? (did == null ? "" : of == null ? String(did) : `${did}/${of}`);
      li.classList.toggle("done", !!done);
      const whole = of == null ? 1 : Math.max(of, 1), part_ = of == null ? (done ? 1 : 0) : did != null && of ? Math.min(did / of, 1) : 0;
      p.style.flexGrow = did == null ? 1 : whole; p.style.setProperty("--done", did == null ? 0 : part_);
    },
    // the open task, its name in bold: its row, for the study to put its item and tools on; null for none, and
    // always null while the tagger is not tagging
    open(key) {
      if (!on) key = null;
      for (const li of rows()) li.classList.toggle("now", li.dataset.task === key);
      return key == null ? null : row(key);
    },
    // whether the tagger tags now; with a value, tagging started or stopped, the study told when it changes
    tagging(now) {
      if (now === undefined) return on;
      now = !!now;
      if (now === on) return on;
      on = now; tagged(on); heardBy?.(on); heard?.(on);
      return on;
    },
    row,
    // whether Submit can be pressed, whether the ground truth is done, partly done or not started where known, and
    // what is left to do as its tooltip
    ready(on, state, title) {
      const b = $("#gt-submit");
      wants = !!on; b.disabled = !wants || !started();
      if (state) b.dataset.state = state; else delete b.dataset.state;
      if (title) b.title = title; else b.removeAttribute("title");
    },
    // the study's progress on the image open, as data it takes back in its resume hook: kept on this device until
    // Clear progress forgets it
    draft(doc) { const k = draftKey(); if (k) { writeJSON(k, doc); api.offer(); } },
    forget() { const k = draftKey(); if (k) try { localStorage.removeItem(k); } catch { /* no storage */ } api.offer(); },
    // Continue tagging: shown for a study that takes drafts back, with an image open; on, and true, while a draft of it
    // is kept
    offer() {
      const b = $("#gt-continue"), d = resume && draftKey() ? draft() : null;
      b.hidden = !resume || !draftKey(); b.disabled = !d;
      b.title = d ? "Back to your ground truth drafted on this image on this device" : "No ground truth drafted for this image on this device yet";
      return !!d;
    },
    // the study's steps moved: Submit follows its first one
    stepped() { $("#gt-submit").disabled = !wants || !started(); },
    // the study leaving: its tasks go
    leave() {
      api.tagging(false);
      pick = submit = heard = resume = null; api.offer();
      for (const li of rows()) li.remove();
      $("#gt-bar").replaceChildren(); $("#gt-list").hidden = true; api.ready(false);
    },
  };
  return api;
}
