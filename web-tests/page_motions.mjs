// The page's motions as they happen, for a test asking whether one is on, started and finished, never how it looks on
// the way. record(ctx) before the page loads. View transitions: begun(page) counts them; moved(page, since, group)
// waits for one begun since then that moved the group named (a name, or a pattern) and finished. CSS transitions and
// animations: played(page) counts them; ran(page, since, wants) waits for each want, a { name, left } with either
// left out, to be matched by one begun since then and ended. Each gives what it found, missing: true when it did not.

// what the motion was doing, for a check that timed out waiting on it: whether a view transition is under way, what
// is animating, and whether the page still draws frames at all
export const motion = (page) => page.evaluate(() => new Promise((done) => {
  const state = (frames) => ({
    transition: !!document.activeViewTransition, frames,
    animations: document.getAnimations().map((a) => `${a.effect?.target?.id || a.effect?.target?.getAttribute?.("class") || "?"}${a.effect?.pseudoElement || ""} ${a.playState} ${Math.round(a.currentTime ?? -1)}`),
  });
  requestAnimationFrame(() => done(state(true)));
  setTimeout(() => done(state(false)), 1000); // waits on purpose: a page drawing no frame for a second has stalled
})).then((x) => JSON.stringify(x), (e) => "the page does not answer: " + e.message);

export const record = (ctx) => ctx.addInitScript(() => {
  window.viewTransitions = [];
  const start = Document.prototype.startViewTransition;
  if (start) Document.prototype.startViewTransition = function (...a) {
    const t = start.apply(this, a), v = { groups: [], finished: false };
    window.viewTransitions.push(v);
    t.ready.then(() => { v.groups = document.getAnimations().map((x) => x.effect?.pseudoElement?.match(/^::view-transition-group\((.+)\)$/)?.[1]).filter(Boolean); },
      (e) => { v.cut = e.name; });
    t.finished.finally(() => { v.finished = true; });
    return t;
  };
  // a CSS transition or animation, by its property or name and whether it is in the left bar
  window.cssMotions = [];
  const begin = (name) => (e) => window.cssMotions.push({ name: e[name], left: !!e.target.closest?.("#left"), target: e.target, ended: false });
  const end = (name) => (e) => { const m = window.cssMotions.findLast((x) => x.target === e.target && x.name === e[name] && !x.ended); if (m) m.ended = true; };
  addEventListener("transitionrun", begin("propertyName"), true);
  addEventListener("animationstart", begin("animationName"), true);
  for (const t of ["transitionend", "transitioncancel"]) addEventListener(t, end("propertyName"), true);
  for (const t of ["animationend", "animationcancel"]) addEventListener(t, end("animationName"), true);
});

// a stall is a failure, a slow machine is not
const WAIT = 15000;
export const begun = (page) => page.evaluate(() => window.viewTransitions.length);
export const moved = (page, since, group) => page.waitForFunction(([n, g]) => {
  const is = (name) => (g.startsWith("/") ? new RegExp(g.slice(1, -1)).test(name) : name === g);
  return window.viewTransitions.slice(n).find((v) => v.finished && v.groups.some(is)) || false;
}, [since, String(group)], { timeout: WAIT }).then((h) => h.jsonValue(),
  async () => ({ missing: true, begun: await page.evaluate((n) => window.viewTransitions.slice(n), since), motion: await motion(page) }));

export const played = (page) => page.evaluate(() => window.cssMotions.length);
export const ran = (page, since, wants) => page.waitForFunction(([n, ws]) => {
  const all = window.cssMotions.slice(n);
  return ws.every((w) => all.some((x) => x.ended && Object.entries(w).every(([k, v]) => x[k] === v)));
}, [since, wants], { timeout: WAIT }).then(() => ({}),
  async () => ({ missing: true, played: await page.evaluate((n) => window.cssMotions.slice(n).map(({ name, left, ended }) => ({ name, left, ended })), since) }));
