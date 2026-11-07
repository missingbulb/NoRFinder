// What a page shows and holds, read so two pages can be compared line by line (req/shell/study/switch-in-place):
// every element of the document with its attributes, its own text, a form control's value, its scroll and whether it
// is open as a popover; the focused element, the title; and the shell's own state (st, the page state). Each line
// is a path to the element and what was read there. VOLATILE says what the comparison leaves out, and why.
//   const lines = await snapshot(page); const diff = differ(lines, otherLines);

// what changes between two readings of the same page with nothing done on it
export const VOLATILE = {
  // the status bar's measures of the tab, which a switch does not restart: memory, CPU, network, disk
  subtrees: ["#sb-res-items"],
  // the browser's own reading of what is scrolled out of view, kept on whatever ever animated, to pause it
  classes: ["offscreen"],
  // attributes that say nothing when empty, which a control set and cleared again leaves behind
  emptied: ["style", "title", "class"],
  // how long Python has run and what it took, which a page that kept Python running counts from its own start
  state: ["heap", "files", "busySince", "busyTimer", "worker"],
};

export const snapshot = (page) => page.evaluate((VOLATILE) => {
  const lines = [];
  const name = (el) => {
    const i = el.parentElement ? [...el.parentElement.children].filter((c) => c.tagName === el.tagName).indexOf(el) : 0;
    return el.tagName.toLowerCase() + (el.id ? "#" + el.id : `[${i}]`);
  };
  const walk = (el, at) => {
    if (["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"].includes(el.tagName) || VOLATILE.subtrees.some((s) => el.matches(s))) return;
    const here = at + "/" + name(el);
    for (const a of [...el.attributes].sort((x, y) => x.name.localeCompare(y.name))) {
      if (a.name === "id" || (!a.value && VOLATILE.emptied.includes(a.name))) continue;
      // a class list is a set: the order its classes were added in shows nowhere
      const value = a.name === "class" ? [...el.classList].filter((c) => !VOLATILE.classes.includes(c)).sort().join(" ") : a.value;
      if (value || !VOLATILE.emptied.includes(a.name)) lines.push(`${here} @${a.name}=${value}`);
    }
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join("").trim();
    if (own) lines.push(`${here} text=${own}`);
    if ("value" in el && el.tagName !== "BUTTON" && el.tagName !== "LI" && el.tagName !== "OPTION") lines.push(`${here} value=${el.value}`);
    if ("checked" in el && el.type !== undefined && /^(checkbox|radio)$/.test(el.type)) lines.push(`${here} checked=${el.checked}`);
    if ("open" in el && typeof el.open === "boolean") lines.push(`${here} open=${el.open}`);
    try { if (el.matches(":popover-open")) lines.push(`${here} popover-open`); } catch { /* not a popover */ }
    if (el.scrollTop || el.scrollLeft) lines.push(`${here} scroll=${el.scrollLeft},${el.scrollTop}`);
    if (el.tagName === "CANVAS") lines.push(`${here} canvas=${el.width}x${el.height}`);
    for (const c of el.children) walk(c, here);
  };
  walk(document.documentElement, "");
  lines.push(`focus ${document.activeElement === document.body ? "body" : name(document.activeElement)}`);
  lines.push(`title ${document.title}`);
  lines.push(`scroll ${scrollX},${scrollY}`);
  const plain = (v) => {
    try { return JSON.stringify(v, (k, x) => (x instanceof ArrayBuffer || ArrayBuffer.isView(x) ? `<${x.byteLength} bytes>` : x)); } catch { return String(v); }
  };
  for (const k of Object.keys(window.st).sort()) if (!VOLATILE.state.includes(k)) lines.push(`st.${k} ${plain(window.st[k])}`);
  for (const k of ["image", "opening"]) lines.push(`page.${k} ${plain(shellForTests.page.get(k))}`);
  return lines;
}, VOLATILE);

// the lines one reading has and the other does not, each marked with the reading it is from
export function differ(a, b, [nameA, nameB] = ["switched", "fresh"]) {
  const count = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const ca = count(a), cb = count(b), out = [];
  for (const [x, n] of ca) for (let i = cb.get(x) || 0; i < n; i++) out.push(`${nameA}: ${x}`);
  for (const [x, n] of cb) for (let i = ca.get(x) || 0; i < n; i++) out.push(`${nameB}: ${x}`);
  return out;
}
