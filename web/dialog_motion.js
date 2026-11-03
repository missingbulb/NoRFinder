// req/shell/dialogs/open-from-button: every modal dialog on the page, the shell's and a study's, grows out of the
// button whose click opened it. A dialog opening this long after the last click was opened by something else.
const SINCE_CLICK_MS = 1000;
const GROW = { duration: 200, easing: "cubic-bezier(.2, .8, .2, 1)" };

export function dialogMotion(still) {
  let pressed = null, at = 0;
  document.addEventListener("click", (e) => {
    pressed = e.target.closest?.("button, a, summary, [role=button], [role=menuitem], [role=tab]") || null;
    at = performance.now();
  }, true);

  function grow(d) {
    const from = pressed;
    pressed = null;
    if (!from?.isConnected || d.contains(from) || performance.now() - at > SINCE_CLICK_MS || still()) return;
    // measured just before the first paint, once what the opener fills in at once is in
    requestAnimationFrame(() => d.open && start(d, from));
  }

  function start(d, from) {
    const b = from.getBoundingClientRect(), r = d.getBoundingClientRect();
    if (!b.width || !b.height || !r.width || !r.height) return;
    const dx = b.left + b.width / 2 - (r.left + r.width / 2), dy = b.top + b.height / 2 - (r.top + r.height / 2);
    d.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${b.width / r.width}, ${b.height / r.height})`, opacity: 0 },
      { transform: "none", opacity: 1 },
    ], GROW);
    try { d.animate([{ opacity: 0 }, { opacity: 1 }], { ...GROW, pseudoElement: "::backdrop" }); } catch { /* a browser that cannot animate the backdrop darkens it at once */ }
  }

  new MutationObserver((changes) => {
    for (const c of changes) if (c.target.localName === "dialog" && !c.oldValue && c.target.open && c.target.matches(":modal")) grow(c.target);
  }).observe(document.body, { subtree: true, attributeFilter: ["open"], attributeOldValue: true });
}
