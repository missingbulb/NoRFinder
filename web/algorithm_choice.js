// The study's algorithms at the top of its Processing box (req/shell/processing/algorithms): the list its study.json
// names, joined with the numbers it names, the first the one chosen at first, each with its icon, its title and, where
// measured, its precision (P) and recall (R); under it how the chosen one works and how well it did. The study reads
// the choice and hears it change.
const two = (x) => x.toFixed(2).replace(/^0/, "");
const pr = (a) => `P ${two(a.precision)} · R ${two(a.recall)}`; // one unbroken pair
const measured = (a) => typeof a.precision === "number" && typeof a.recall === "number";
const capital = (s) => s[0].toUpperCase() + s.slice(1);

export function algorithmChoice({ $, outline, status }) {
  const box = $("#algorithm-pick"), sel = $("#algorithm"), heard = [];
  let list = [], doc = null, ready = Promise.resolve([]);
  const chosen = () => list.find((a) => a.key === sel.value);
  function about() {
    const a = chosen(); if (!a) return;
    $("#algorithm-about summary").textContent = `How the ${a.title} algorithm works`;
    const note = $("#algorithm-note");
    note.replaceChildren(outline(a.about));
    if (!measured(a)) return;
    const p = document.createElement("p"), b = document.createElement("strong");
    b.textContent = `${capital(a.title)} algorithm shows precision of ${a.precision.toFixed(2)} and recall of ${a.recall.toFixed(2)}${doc.measured ? " " + doc.measured : ""}`;
    p.append(b); if (a.note) p.append(` (${a.note})`);
    note.append(p);
  }
  sel.addEventListener("change", () => { about(); for (const fn of [...heard]) fn(sel.value); });
  return {
    // the study coming in: its list and their numbers fetched, the page never waiting on them; an algorithm the
    // numbers leave out shows none
    mount(manifest, base, signal) {
      const named = manifest.algorithms;
      box.hidden = !named;
      if (!named) { ready = Promise.resolve([]); return; }
      const json = (rel) => fetch(base + rel).then((r) => { if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`); return r.json(); });
      ready = Promise.all([json(named.list), named.metrics ? json(named.metrics) : {}])
        .then(([own, q]) => {
          if (signal.aborted) return new Promise(() => {});
          doc = { measured: q.measured };
          list = own.map((a) => { const m = q.versions?.[a.key]; return m ? { ...a, precision: m.precision, recall: m.recall, note: m.note } : a; });
          sel.replaceChildren(...list.map((a) => new Option(`${a.icon || ""} ${a.title}${measured(a) ? ` (${pr(a)})` : ""}`.trim(), a.key)));
          sel.title = list.some(measured) ? `Precision (P) and recall (R) of each algorithm${doc.measured ? " " + doc.measured : ""}` : "";
          sel.disabled = !list.length; about();
          return list;
        }, (e) => { if (!signal.aborted) status(`The algorithms could not be listed: ${e.message || e}`, true); return signal.aborted ? new Promise(() => {}) : []; });
    },
    // the study leaving: the list as before any study came in
    leave() {
      heard.length = 0; list = []; doc = null; sel.replaceChildren(); sel.title = ""; sel.disabled = true; box.hidden = true;
      $("#algorithm-about").open = false; $("#algorithm-about summary").textContent = "How the algorithm works"; $("#algorithm-note").replaceChildren();
    },
    // what the study is handed: the list once fetched, the chosen key and title, and each change of it
    api: {
      get ready() { return ready; },
      get key() { return chosen()?.key; },
      get title() { return chosen()?.title; },
      on(fn) { heard.push(fn); },
    },
  };
}
