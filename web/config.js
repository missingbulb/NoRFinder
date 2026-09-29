// Settings that belong to where the site is deployed, not to its code. The deploy overwrites this
// file (web/build.py) from the repository variables GOOGLE_API_KEY, which lets "Load from Google
// Drive" read files and folders shared as "Anyone with the link" (empty, the option is off), and
// DRIVE_DEFAULT_FOLDER, the link that option opens on.
window.NOR_CONFIG = {
  google: { apiKey: "" },
  drive: { defaultLink: "" },
};
