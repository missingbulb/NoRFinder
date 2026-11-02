// The app once registered its service worker here, at the site's top, where it served the whole site. The app
// keeps its own under app/ now; browsers still holding the old registration check it against this file, which
// takes its place and ends it, leaving everything the app kept on the device to the app.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.registration.unregister()));
