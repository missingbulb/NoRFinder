// What a [data-help] element's help shows while the pointer is over it (or, with focus: true, while it has the
// keyboard's focus): {text, side}, side "above" or "right" by where the help's box is drawn, and null for both
// when no help shows. The help is drawn by the stylesheet, so its box is found by hit-testing around the element.
export async function helpTip(page, selector, { focus = false } = {}) {
  await page.addStyleTag({ content: "[data-help]::before { pointer-events: auto !important; }" });
  // the keyboard's focus as a user tabbing to it gives it: on the element, Tab away and Shift+Tab back to it, since an
  // engine may count a script's focus, or a lone Shift, as no keyboard's
  if (focus) { await page.focus(selector); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab"); } else await page.hover(selector);
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
