// When the page's background work runs: every cadence, debounce and deadline it keeps, in one place.

// fn every ms; while the tab is hidden it rests, unless whenHidden, and once shown runs at once when ms has passed.
// Returns what stops it.
export function every(ms, fn, { whenHidden = false } = {}) {
  let id = 0, last = Date.now();
  const run = () => { last = Date.now(); fn(); };
  const rest = () => { clearInterval(id); id = 0; };
  const seen = () => {
    if (document.hidden) return rest();
    if (id) return;
    if (Date.now() - last >= ms) run();
    id = setInterval(run, ms);
  };
  if (!whenHidden) document.addEventListener("visibilitychange", seen);
  if (whenHidden || !document.hidden) id = setInterval(run, ms);
  return () => { rest(); document.removeEventListener("visibilitychange", seen); };
}

// fn once ms after the last call, a run of calls answered once; .cancel() drops the one waiting.
export function settle(ms, fn) {
  let id = 0;
  const soon = (...a) => { clearTimeout(id); id = setTimeout(fn, ms, ...a); };
  soon.cancel = () => clearTimeout(id);
  return soon;
}

// what promise settles to, or otherwise once ms has passed without it.
export function within(ms, promise, otherwise) {
  let id = 0;
  return Promise.race([promise, new Promise((ok) => { id = setTimeout(ok, ms, otherwise); })]).finally(() => clearTimeout(id));
}

// fn once, ms from now. Returns what cancels it.
export function after(ms, fn) {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}
