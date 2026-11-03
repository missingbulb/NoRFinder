// A browser context that keeps what the page stores across a reload, in a profile of its own: Playwright's WebKit
// empties the cache storage of a throwaway context on every reload, where Safari keeps it, so a test of what the page
// keeps on this device needs this one. The engine is the one PW_ENGINE names.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const keptContext = (pw, options) =>
  pw[process.env.PW_ENGINE || "chromium"].launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "kept-")), options);
