// What the page's motion was doing, for a check that timed out waiting on it: whether a view transition is under way,
// what is animating, and whether the page still draws frames at all.
export const motion = (page) => page.evaluate(() => new Promise((done) => {
  const state = (frames) => ({
    transition: !!document.activeViewTransition, frames,
    animations: document.getAnimations().map((a) => `${a.effect?.target?.id || a.effect?.target?.getAttribute?.("class") || "?"}${a.effect?.pseudoElement || ""} ${a.playState} ${Math.round(a.currentTime ?? -1)}`),
  });
  requestAnimationFrame(() => done(state(true)));
  setTimeout(() => done(state(false)), 1000); // waits on purpose: a page drawing no frame for a second has stalled
})).then((x) => JSON.stringify(x), (e) => "the page does not answer: " + e.message);
