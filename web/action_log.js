// The user's last actions on this device (req/shell/report/action-log): what they clicked, ticked, chose or
// opened, and the errors the page met, newest last, for a problem report to quote. Kept in the browser, so a
// report filed after a reload still has what led to it; the page sends it nowhere.
export const ACTIONS = "nor-actions"; // [{at, kind, text}]: at an ISO time, kind "action" or "error"
const KEEP = 200;
const LONGEST = 160;

// A control's name as the user reads it. One inside an element marked data-log-as shows the user's own content
// (an image's name, a folder's), and is logged by that mark instead, so no file name reaches the log.
function nameOf(el) {
  const own = el.closest("[data-log-as]");
  if (own) return own.dataset.logAs;
  const label = el.getAttribute("aria-label") || el.labels?.[0]?.textContent || el.textContent || el.title || el.id || el.tagName.toLowerCase();
  return label.replace(/\s+/g, " ").trim().slice(0, 60);
}
// where a control is: the dialog or popup it is in, by its title
function placeOf(el) {
  const box = el.closest("dialog, [popover]");
  if (!box) return "";
  const title = box.getAttribute("aria-label") || document.getElementById(box.getAttribute("aria-labelledby"))?.textContent || box.querySelector("h2")?.textContent;
  return title ? ` in ${title.trim()}` : "";
}

export function actionLog(store = localStorage) {
  const read = () => { try { return JSON.parse(store.getItem(ACTIONS)) || []; } catch { return []; } };
  function add(text, kind = "action") {
    const list = [...read(), { at: new Date().toISOString(), kind, text: String(text).slice(0, LONGEST) }].slice(-KEEP);
    try { store.setItem(ACTIONS, JSON.stringify(list)); } catch { /* no storage: nothing kept */ }
  }
  // what the user does with the page's controls, by name, never what they type
  function watch(root = document) {
    root.addEventListener("click", (e) => {
      const el = e.target.closest?.("button, a, summary, [role=tab], [role=menuitem], .crumb, canvas");
      if (!el) return;
      if (el.tagName === "CANVAS") return add("Clicked the image");
      add(`Clicked “${nameOf(el)}”${placeOf(el)}`);
    }, true);
    root.addEventListener("contextmenu", (e) => { if (e.target.tagName === "CANVAS") add("Right-clicked the image"); }, true);
    root.addEventListener("change", (e) => {
      const el = e.target;
      if (!el.matches?.("input, select")) return;
      const what = `“${nameOf(el)}”${placeOf(el)}`;
      if (el.type === "checkbox" || el.type === "radio") add(`${el.checked ? "Ticked" : "Unticked"} ${what}`);
      else if (el.tagName === "SELECT") add(`Chose “${el.selectedOptions[0]?.textContent.trim() ?? ""}” in ${what}`);
      else if (el.type === "range" || el.type === "number" || el.type === "color") add(`Set ${what} to ${el.value}`);
      else if (el.type === "file") add(`Chose a file to open${placeOf(el)}`);
      else add(`Changed ${what}`);
    }, true);
    addEventListener("error", (e) => add(`${e.message || "A script failed"}${e.filename ? ` (${e.filename.split("/").pop()}:${e.lineno})` : ""}`, "error"));
    addEventListener("unhandledrejection", (e) => add(`${e.reason?.message || e.reason || "A promise failed"}`, "error"));
  }
  return { add, watch, last: (n, kind) => read().filter((e) => !kind || e.kind === kind).slice(-n), clear: () => { try { store.removeItem(ACTIONS); } catch { /* nothing kept */ } } };
}
