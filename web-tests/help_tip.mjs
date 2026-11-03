// What a [data-help] element's help shows while the pointer is over it (or, with focus: true, while it has the
// keyboard's focus): {text, side}, side "above" or "right" by where the help's box is drawn, and null for both
// when no help shows. The help is drawn by the stylesheet, so its box is found by hit-testing around the element.
export async function helpTip(page, selector, { focus = false } = {}) {
  await page.addStyleTag({ content: "[data-help]::before { pointer-events: auto !important; }" });
  // a key pressed first, so the focus reads as the keyboard's, as a user tabbing to it
  if (focus) { await page.keyboard.press("Shift"); await page.focus(selector); } else await page.hover(selector);
  await page.waitForFunction((s) => getComputedStyle(document.querySelector(s), "::before").content !== "none", selector, { timeout: 3000 }).catch(() => {});
  return page.evaluate((s) => {
    const e = document.querySelector(s), r = e.getBoundingClientRect(), shown = getComputedStyle(e, "::before").content !== "none";
    const at = (x, y) => document.elementFromPoint(x, y) === e;
    const side = !shown ? null : at(r.left + 4, r.top - 10) ? "above" : at(r.right + 14, r.top + 4) ? "right" : "elsewhere";
    return { text: shown ? e.dataset.help : null, side };
  }, selector);
}

// whether any help shows now
export const anyHelp = (page) => page.evaluate(() => [...document.querySelectorAll("[data-help]")].some((e) => getComputedStyle(e, "::before").content !== "none"));
