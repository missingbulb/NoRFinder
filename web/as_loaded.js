// Parts of the page as it loaded, put back on demand (req/shell/study/switch-in-place): each element under them
// gets back its attributes, its form value, its text and, where its children changed, the very nodes it held, with
// their listeners. An attribute keep(el, name) claims is left as it is now, for what another part of the page
// owns there (the holds offline puts on a control).
"use strict";

export function asLoaded(roots, keep = () => false) {
  const taken = [];
  for (const root of roots) {
    for (const el of [root, ...root.querySelectorAll("*")]) {
      taken.push({
        el, attrs: [...el.attributes].map((a) => [a.name, a.value]), kids: [...el.childNodes],
        texts: [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => [n, n.data]),
        value: "value" in el && el.tagName !== "BUTTON" ? el.value : undefined, checked: el.checked,
      });
    }
  }
  return function restore() {
    for (const { el, attrs, kids, texts, value, checked } of taken) {
      const was = new Map(attrs);
      for (const a of [...el.attributes]) if (!was.has(a.name) && !keep(el, a.name)) el.removeAttribute(a.name);
      for (const [n, v] of was) if (el.getAttribute(n) !== v && !keep(el, n)) el.setAttribute(n, v);
      if (kids.length !== el.childNodes.length || kids.some((k, i) => el.childNodes[i] !== k)) el.replaceChildren(...kids);
      for (const [n, d] of texts) if (n.data !== d) n.data = d;
      if (value !== undefined && el.value !== value) el.value = value;
      if (typeof checked === "boolean") el.checked = checked;
    }
  };
}
