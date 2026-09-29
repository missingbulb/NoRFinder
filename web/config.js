// Settings that belong to where the site is deployed, not to its code. The deploy overwrites this
// file (web/build.py) with the repository variable GOOGLE_API_KEY, which lets "Load from Google
// Drive" read files and folders shared as "Anyone with the link"; empty, the option is off.
window.NOR_CONFIG = {
  google: { apiKey: "" },
};
