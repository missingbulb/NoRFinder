// A problem report (req/shell/report/bug): a new GitHub issue on the repo's bug-report form, its fields filled in
// with the browser, the study, the page's state and the user's last actions, for the user to read, add to and
// submit themselves; the page sends nothing.
export const BUG_FORM = "bug-report.yml";
// how many of the user's last actions, and of the page's last errors, a report quotes
export const ACTIONS_QUOTED = 5;
export const ERRORS_QUOTED = 3;

const clock = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const listed = (entries, none) => (entries.length ? entries.map((e, i) => `${i + 1}. ${clock(e.at)} ${e.text}`).join("\n") : none);

// the new issue's address. browser: {text, supported}; state: [[label, text]]; actions and errors: the log's
// entries, oldest first
export function problemUrl({ repo, browser, state, actions, errors }) {
  const q = new URLSearchParams({
    template: BUG_FORM,
    title: browser.supported ? "Problem: " : "Unsupported browser: ",
    browser: browser.text,
    state: state.map(([k, v]) => `- ${k}: ${v}`).join("\n"),
    actions: listed(actions, "None kept on this device."),
    errors: listed(errors, "None."),
  });
  return `https://github.com/${repo}/issues/new?${q}`;
}
