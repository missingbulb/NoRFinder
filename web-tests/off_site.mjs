// Which of a page's requests a test's catch-all route turns away: those over the network to anywhere but the test's
// own server and the prefixes named. Only http(s): WebKit routes the page's own blob: and data: addresses too, and a
// route that aborted them would break every picture the page makes from bytes it holds.
export const offSite = (origin, ...allowed) => (u) =>
  /^https?:/.test(u.href) && !u.href.startsWith(origin) && !allowed.some((a) => u.href.startsWith(a));
