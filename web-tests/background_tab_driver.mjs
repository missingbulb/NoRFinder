// Drives the page (web/) in headless Chromium on the fixture study, against the stand-in Google of stand_in_drive.mjs
// serving ROOT, with a stand-in service worker counting what it is asked and the page's clock moved by the test, and
// checks that a hidden tab calls nothing on its own: req/shell/offline/default asks whether the site answers every
// 30 s, and req/shell/site/out-of-date fetches the published page every 5 minutes, while the tab is shown alone;
// shown again after longer, each asks at once.
// Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/background_tab_driver.mjs ANSWERS STUDIES ROOT
import { standIn } from "./stand_in_drive.mjs";

const [answers, studies, rootDir] = process.argv.slice(2);
const { open, check, done, origin } = await standIn({ answers, studies, rootDir });

// the published page, fetched with no-store to read its version
let published = 0;
const page = await open(false, {
  async prepare(ctx) {
    await ctx.clock.install();
    await ctx.route(origin + "/web/fixture", (r) => { if (r.request().resourceType() === "fetch") published++; return r.fallback(); });
    // the tab's visibility, the test's to set; a worker answering "site" with an up-to-date copy, counting each ask
    await ctx.addInitScript(() => {
      window.hiddenTab = false;
      Object.defineProperty(document, "hidden", { get: () => window.hiddenTab });
      Object.defineProperty(document, "visibilityState", { get: () => (window.hiddenTab ? "hidden" : "visible") });
      const heard = new EventTarget();
      window.siteAsks = 0;
      const active = { postMessage(m) {
        if (m?.type !== "site") return;
        window.siteAsks++;
        queueMicrotask(() => heard.dispatchEvent(Object.assign(new Event("message"), { data: { type: "site", files: 0, cache: "site-test" } })));
      } };
      Object.defineProperty(navigator, "serviceWorker", { value: {
        ready: Promise.resolve({ active }), controller: active, register: async () => ({ active }),
        addEventListener: (t, f, o) => heard.addEventListener(t, f, o), removeEventListener: (t, f, o) => heard.removeEventListener(t, f, o),
      } });
    });
  },
});
const asks = () => page.evaluate(() => window.siteAsks);
const show = (on) => page.evaluate((on) => { window.hiddenTab = !on; document.dispatchEvent(new Event("visibilitychange")); }, on);

await page.waitForFunction(() => window.siteAsks > 0);
let before = await asks();
await page.clock.fastForward(30000);
await page.waitForFunction((n) => window.siteAsks > n, before);
await check(await asks() > before, "a shown tab asks whether the site answers every 30 s");

await show(false);
before = await asks();
const fetched = published;
await page.clock.runFor(11 * 60000);
await check(await asks() === before, "a hidden tab asks nothing for 11 minutes", (await asks()) - before);
await check(published === fetched, "a hidden tab fetches no published page for 11 minutes", published - fetched);

const back = page.waitForResponse((r) => r.url() === origin + "/web/fixture" && r.request().resourceType() === "fetch").catch(() => {});
await show(true);
await page.waitForFunction((n) => window.siteAsks > n, before).catch(() => {});
await check(await asks() === before + 1, "shown again, it asks once at once", (await asks()) - before);
await back;
await check(published === fetched + 1, "shown again after 5 minutes, it fetches the published page once", published - fetched);
await done();
