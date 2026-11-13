// The page has drawn n frames since the call: what the last change set off has been painted, and a handler that runs
// in a frame has run. Two by default: the change's own frame, then one painted after it.
export const frames = (page, n = 2) => page.evaluate((n) => new Promise((ok) => {
  const next = (left) => (left ? requestAnimationFrame(() => next(left - 1)) : ok());
  next(n);
}), n);

// The 3D view has drawn since the call, from a redraw asked for now: what was changed before it is on its canvas.
export const viewDrawn = (page) => page.evaluate(() => new Promise((ok) => {
  const v = window.shellForTests.viewer.three, heard = new AbortController();
  v.onDraw(() => { heard.abort(); ok(); }, heard.signal);
  v.redraw();
}));
