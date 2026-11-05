// Waits until fn, run in the page with arg, resolves to something truthy. page.waitForFunction cannot do this for an
// async fn: it takes the promise fn returns as the truthy value, and resolves at once, on every engine.
export async function until(page, fn, arg, { timeout = 10000, every = 100 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    // a navigation under way destroys the page's context: not yet, rather than a failure
    if (await page.evaluate(fn, arg).catch(() => false)) return;
    if (Date.now() > end) throw new Error(`timed out after ${timeout} ms waiting for ${fn}`);
    await new Promise((ok) => setTimeout(ok, every)); // waits on purpose: the poll's interval, an async fn having no event to wait on
  }
}
