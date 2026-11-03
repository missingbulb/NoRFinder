// The Playwright engine the page tests drive: the one PW_ENGINE names, Chromium when it names none
// (req/checks/other-engines).
export const ENGINE = process.env.PW_ENGINE || "chromium";
