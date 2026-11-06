// The Playwright engine the page tests drive: the one PW_ENGINE names, Chromium when it names none
// (req/checks/other-engines).
export const ENGINE = process.env.PW_ENGINE || "chromium";

// How each driver launches it. Headless Firefox on Linux makes no WebGL context until it is pointed at
// Mesa's software EGL in its own process; a person's Firefox has WebGL2, so the 3D view is tested there too.
export const LAUNCH = ENGINE === "firefox"
  ? { firefoxUserPrefs: { "webgl.force-enabled": true, "webgl.out-of-process": false }, env: { ...process.env, MOZ_WEBGL_FORCE_EGL: "1" } }
  : {};
