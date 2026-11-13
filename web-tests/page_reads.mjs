// The page's reads of a few files of its own, waited for until the page has acted on them, for a check that needs
// what follows a read the page shows nothing of (a verdict kept for later, a version written to localStorage).
//   await watchReads(ctx, ["version_history.json"]);   before the page loads
//   await readsDone(page);                               once the page has started them
// A read settles a task after its fetch, or its parse once the page asks for one, has resolved: by then the
// handlers the page chained on them have run.
export const watchReads = (ctx, names) => ctx.addInitScript((names) => {
  const named = (u) => names.find((n) => String(u).includes(n));
  const after = (p) => p.then(() => {}, () => {}).then(() => new Promise((ok) => { const c = new MessageChannel(); c.port1.onmessage = () => ok(); c.port2.postMessage(0); }));
  const reads = (window.pageReads = new Map());
  const fetchNow = window.fetch, json = Response.prototype.json;
  window.fetch = function (u, ...rest) {
    const p = fetchNow.call(this, u, ...rest);
    if (named(u)) reads.set(named(u), after(p));
    return p;
  };
  Response.prototype.json = function () {
    const p = json.call(this);
    if (named(this.url)) reads.set(named(this.url), after(p));
    return p;
  };
}, names);
// every watched read the page has started, settled; a parse replaces its fetch's wait, so each is followed to its last
export const readsDone = (page) => page.evaluate(async () => {
  for (let again = true; again; ) {
    again = false;
    for (const [k, p] of [...window.pageReads]) { await p; if (window.pageReads.get(k) !== p) again = true; }
  }
});
