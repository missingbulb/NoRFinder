// The Settings dialog (1.52): every setting that follows the user, each with a control, saved together. It knows the
// settings only as the fields the shell hands it: {key, label, kind, ...}, kind one of
//   choice  options [[value, label]], fallback: a select;           toggle  on, off, fallback, label: a checkbox;
//   text    a text box, empty forgets it;                           map     {name: text}: a text box per name;
//   set     [string]: a tick per entry, cleared to drop it;         list    [object], name(entry): the same, by name;
// raw: the browser keeps the value as it is, not as JSON. get(key) is what the browser keeps under a key, null for
// nothing; set(key, value) keeps it, null forgetting it.
"use strict";
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function settingsDialog({ dialog, fields, get, set, where, saved }) {
  const $ = (s) => dialog.querySelector(s);
  const parse = (f) => {
    const raw = get(f.key);
    if (raw === null) return undefined;
    if (f.raw) return raw;
    try { return JSON.parse(raw); } catch { return undefined; }
  };

  function row(f) {
    const v = parse(f), name = `name="${esc(f.key)}"`;
    const box = (value, label, on) => `<label class="tick"><input type="checkbox" ${name} value="${esc(value)}"${on ? " checked" : ""}> ${esc(label)}</label>`;
    let control;
    if (f.kind === "choice") {
      const now = v === undefined ? f.fallback : v;
      control = `<select ${name}>${f.options.map(([o, l]) => `<option value="${esc(o)}"${o === now ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    } else if (f.kind === "toggle") {
      return `<div class="setting">${box("", f.label, (v === undefined ? f.fallback : v) === f.on)}</div>`;
    } else if (f.kind === "text") {
      control = `<input type="text" ${name} value="${esc(v || "")}" spellcheck="false">`;
    } else if (f.kind === "map") {
      const entries = Object.entries(v || {});
      control = entries.length ? entries.map(([k, t]) => `<label class="sub">${esc(k)} <input type="text" ${name} data-study="${esc(k)}" value="${esc(t)}" spellcheck="false"></label>`).join("") : `<span class="dim">None yet</span>`;
    } else {
      const items = Array.isArray(v) ? v : [];
      control = items.length ? items.map((e, i) => box(f.kind === "set" ? e : String(i), f.kind === "set" ? e : f.name(e), true)).join("") : `<span class="dim">None yet</span>`;
    }
    return `<div class="setting"><span class="name">${esc(f.label)}</span><div class="control">${control}</div></div>`;
  }

  // what the dialog now says each field holds, as the browser would keep it: null to forget it
  function value(f) {
    const inputs = [...dialog.querySelectorAll(`[name="${CSS.escape(f.key)}"]`)];
    const keep = (v) => (f.raw ? v : JSON.stringify(v));
    // a setting never set and left as it shows stays unset
    const chosen = (v) => (v === "" || (get(f.key) === null && v === f.fallback) ? null : keep(v));
    if (f.kind === "choice") return chosen(inputs[0].value);
    if (f.kind === "toggle") return chosen(inputs[0].checked ? f.on : f.off);
    if (f.kind === "text") return inputs[0].value.trim() ? keep(inputs[0].value.trim()) : null;
    const before = parse(f);
    if (f.kind === "map") {
      if (!inputs.length) return get(f.key);
      const out = {};
      for (const i of inputs) if (i.value.trim()) out[i.dataset.study] = i.value.trim();
      return keep(out);
    }
    if (!inputs.length) return get(f.key);
    return keep(f.kind === "set" ? inputs.filter((i) => i.checked).map((i) => i.value) : before.filter((_, n) => inputs[n].checked));
  }

  $("#settings-cancel").onclick = () => dialog.close();
  $("#settings-save").onclick = () => {
    for (const f of fields()) {
      const now = value(f);
      if (now !== get(f.key)) set(f.key, now);
    }
    dialog.close();
    saved();
  };
  return {
    open() {
      $("#settings-where").textContent = where();
      $("#settings-list").innerHTML = fields().map(row).join("");
      dialog.showModal();
    },
  };
}
