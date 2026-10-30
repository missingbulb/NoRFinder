// Cloudflare Web Analytics: cookieless visit counts, with nothing stored on the visitor's device and
// no tracking across sites. The release substitutes the token, kept in the CLOUDFLARE_ANALYTICS_TOKEN
// repository variable (public, it ships to every visitor), into the copy it uploads; the committed
// file always carries the placeholder, and while it does (a local preview, or no variable) this
// loads nothing.
(function () {
  var TOKEN = 'REPLACE_WITH_CLOUDFLARE_WEB_ANALYTICS_TOKEN';
  if (!TOKEN || TOKEN.lastIndexOf('REPLACE_WITH', 0) === 0) return;
  var beacon = document.createElement('script');
  beacon.defer = true;
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: TOKEN }));
  (document.head || document.documentElement).appendChild(beacon);
})();
