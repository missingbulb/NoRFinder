// Whether a page error is WebKit's report of work cut short by the page being left or closed, rather than the page's
// own: a fetch or a script the navigation cancelled ("Load failed", "... due to access control checks."), or a promise
// the closing context stopped. Chromium reports none of these, so the same failure, if it were the page's, still
// shows in a Chromium run.
import { ENGINE } from "./engine.mjs";

export const cutShort = (e) => ENGINE === "webkit" && /^(Load failed|Context is stopped)$|due to access control checks\.$/.test(e.message);
